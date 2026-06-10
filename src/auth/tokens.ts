/**
 * On-disk token store for the ChatGPT sign-in (auth.json).
 *
 * Lives on disk, not in the keychain, because of platform blob size caps.
 * Written atomically with owner-only mode. Refresh is single flight inside
 * the process (promise mutex) and across processes (lockfile with stale
 * takeover). Token values are never logged and never appear in errors.
 */

import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFileSync, authJsonPath, locksDir } from '../config/paths.js';
import { decodeIdToken, OAuthRefreshError, refreshTokens, type FetchLike } from './oauth.js';

/** Fallback lifetime assumption when issued_at is missing: 10 days. */
const DEFAULT_LIFETIME_MS = 10 * 24 * 60 * 60 * 1000;
/** Refresh proactively once 80 percent of the lifetime has passed. */
const REFRESH_AT_FRACTION = 0.8;
/** A lockfile older than this is considered abandoned and taken over. */
const LOCK_STALE_MS = 30_000;
/** Give up waiting for another process after this long. */
const LOCK_WAIT_MS = 45_000;
const LOCK_POLL_MS = 100;

export interface StoredTokens {
  provider: 'openai-chatgpt';
  access_token: string;
  refresh_token: string;
  id_token: string;
  account_id: string;
  plan_type: string;
  /** Epoch ms when the access token expires. */
  expires_at: number;
  /** Epoch ms when the set was issued. Anchors the 80 percent refresh point. */
  issued_at?: number;
  minted_api_key?: string;
  /** Set when a terminal refresh failure makes this sign-in unusable. */
  dead?: boolean;
  deadReason?: string;
}

/** The saved sign-in can no longer be used. A grown-up must sign in again. */
export class AuthDeadError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super('The saved sign-in no longer works. A grown-up needs to sign in again.');
    this.name = 'AuthDeadError';
    this.reason = reason;
  }
}

/** Writes the token set atomically with owner-only permissions. */
export function saveTokens(tokens: StoredTokens): void {
  atomicWriteFileSync(authJsonPath(), JSON.stringify(tokens, null, 2), 0o600);
}

/** Reads and validates auth.json. Returns null when missing or malformed. */
export function loadTokens(): StoredTokens | null {
  try {
    const raw = fs.readFileSync(authJsonPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const data = parsed as Record<string, unknown>;
    if (
      data.provider !== 'openai-chatgpt' ||
      typeof data.access_token !== 'string' ||
      typeof data.refresh_token !== 'string' ||
      typeof data.expires_at !== 'number'
    ) {
      return null;
    }
    return data as unknown as StoredTokens;
  } catch {
    return null;
  }
}

export function hasTokens(): boolean {
  return loadTokens() !== null;
}

export function clearTokens(): void {
  fs.rmSync(authJsonPath(), { force: true });
}

/** Marks the stored sign-in dead so callers stop retrying refresh. */
export function markDead(reason: string): void {
  const current = loadTokens();
  if (current !== null) {
    saveTokens({ ...current, dead: true, deadReason: reason });
  }
}

/** True once 80 percent of the token lifetime has passed (or it expired). */
export function needsRefresh(tokens: StoredTokens, now: number = Date.now()): boolean {
  if (now >= tokens.expires_at) {
    return true;
  }
  const issuedAt = tokens.issued_at ?? tokens.expires_at - DEFAULT_LIFETIME_MS;
  const lifetime = tokens.expires_at - issuedAt;
  if (lifetime <= 0) {
    return true;
  }
  return now >= issuedAt + lifetime * REFRESH_AT_FRACTION;
}

function authLockPath(): string {
  return path.join(locksDir(), 'auth.lock');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acquires the cross-process refresh lock. Waits for a live lock, takes
 * over a stale one (older than 30 seconds). Returns a release function.
 */
async function acquireLock(): Promise<() => void> {
  const lockFile = authLockPath();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, at: Date.now() }), {
        flag: 'wx',
        mode: 0o600,
      });
      return (): void => {
        try {
          fs.rmSync(lockFile, { force: true });
        } catch {
          // Releasing is best effort; a leftover lock goes stale in 30s.
        }
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw err;
      }
      let stale = false;
      try {
        stale = Date.now() - fs.statSync(lockFile).mtimeMs > LOCK_STALE_MS;
      } catch {
        // The lock vanished between attempts; retry right away.
        continue;
      }
      if (stale) {
        try {
          fs.rmSync(lockFile, { force: true });
        } catch {
          // Another process may have removed it first.
        }
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error('auth-lock-timeout');
      }
      await sleep(LOCK_POLL_MS);
    }
  }
}

/** In-process single flight: concurrent callers share one refresh. */
let refreshInFlight: Promise<string> | null = null;

/**
 * Returns a usable access token. Refreshes proactively past 80 percent of
 * the lifetime: persist first, then return. Terminal refresh failures mark
 * the store dead and throw AuthDeadError.
 */
export async function getValidAccessToken(
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<string> {
  const current = loadTokens();
  if (current === null) {
    throw new AuthDeadError('no-tokens');
  }
  if (current.dead === true) {
    throw new AuthDeadError(current.deadReason ?? 'dead');
  }
  if (!needsRefresh(current)) {
    return current.access_token;
  }
  if (refreshInFlight === null) {
    refreshInFlight = refreshWithLock(fetchImpl).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function refreshWithLock(fetchImpl: FetchLike): Promise<string> {
  const release = await acquireLock();
  try {
    // Re-read after acquiring: another process may have refreshed already.
    const current = loadTokens();
    if (current === null) {
      throw new AuthDeadError('no-tokens');
    }
    if (current.dead === true) {
      throw new AuthDeadError(current.deadReason ?? 'dead');
    }
    if (!needsRefresh(current)) {
      return current.access_token;
    }
    try {
      const rotated = await refreshTokens(current.refresh_token, fetchImpl);
      const now = Date.now();
      const next: StoredTokens = {
        ...current,
        access_token: rotated.access_token,
        refresh_token: rotated.refresh_token ?? current.refresh_token,
        id_token: rotated.id_token ?? current.id_token,
        issued_at: now,
        expires_at:
          rotated.expires_in !== undefined
            ? now + rotated.expires_in * 1000
            : now + DEFAULT_LIFETIME_MS,
      };
      delete next.dead;
      delete next.deadReason;
      if (rotated.id_token !== undefined) {
        try {
          const info = decodeIdToken(rotated.id_token);
          if (info.accountId.length > 0) {
            next.account_id = info.accountId;
            next.plan_type = info.planType;
          }
        } catch {
          // Keep the prior identity fields when the new id_token is odd.
        }
      }
      // Persist FIRST (the refresh token rotated), THEN return.
      saveTokens(next);
      return next.access_token;
    } catch (err) {
      if (err instanceof OAuthRefreshError && err.kind === 'auth-dead') {
        markDead(err.reason);
        throw new AuthDeadError(err.reason);
      }
      throw err;
    }
  } finally {
    release();
  }
}
