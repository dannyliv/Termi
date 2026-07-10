/**
 * npm registry version check with a short disk cache so session start stays
 * snappy. Fail-open: network errors never block Termi from starting.
 */

import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFileSync, termiHome } from '../config/paths.js';
import { isNewerVersion, NPM_PACKAGE, readLocalVersion } from './version.js';

/** How long a successful registry answer is reused. */
export const VERSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** Hard cap on the registry round-trip so boot never hangs. */
export const VERSION_FETCH_TIMEOUT_MS = 2500;

export interface VersionCheckResult {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  /** True when we could not reach the registry (or parse it). */
  skipped: boolean;
  reason?: string;
}

interface CacheFile {
  fetchedAt: string;
  latest: string;
  currentAtFetch: string;
}

export function versionCachePath(): string {
  return path.join(termiHome(), 'version-check.json');
}

function readCache(): CacheFile | null {
  try {
    const raw = fs.readFileSync(versionCachePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<CacheFile>;
    if (
      typeof parsed.fetchedAt === 'string' &&
      typeof parsed.latest === 'string' &&
      typeof parsed.currentAtFetch === 'string'
    ) {
      return {
        fetchedAt: parsed.fetchedAt,
        latest: parsed.latest,
        currentAtFetch: parsed.currentAtFetch,
      };
    }
  } catch {
    // Missing or corrupt cache is fine.
  }
  return null;
}

function writeCache(cache: CacheFile): void {
  try {
    atomicWriteFileSync(versionCachePath(), `${JSON.stringify(cache, null, 2)}\n`);
  } catch {
    // Cache is best-effort.
  }
}

export interface FetchLatestOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: number;
  /** Force a network fetch even when the cache is fresh. */
  force?: boolean;
}

/**
 * Returns the latest published version from the npm registry, or null on
 * any failure. Uses a 6-hour on-disk cache.
 */
export async function fetchLatestVersion(opts: FetchLatestOptions = {}): Promise<string | null> {
  const now = opts.now ?? Date.now();
  if (!opts.force) {
    const cached = readCache();
    if (cached !== null) {
      const age = now - Date.parse(cached.fetchedAt);
      if (Number.isFinite(age) && age >= 0 && age < VERSION_CACHE_TTL_MS && cached.latest.length > 0) {
        return cached.latest;
      }
    }
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? VERSION_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { version?: unknown };
    if (typeof body.version !== 'string' || body.version.length === 0) {
      return null;
    }
    writeCache({
      fetchedAt: new Date(now).toISOString(),
      latest: body.version,
      currentAtFetch: readLocalVersion(),
    });
    return body.version;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compares the running install to the latest npm version.
 * Never throws. Offline or timeout => skipped, updateAvailable false.
 */
export async function checkForUpdate(opts: FetchLatestOptions = {}): Promise<VersionCheckResult> {
  const current = readLocalVersion();
  const latest = await fetchLatestVersion(opts);
  if (latest === null) {
    return { current, latest: null, updateAvailable: false, skipped: true, reason: 'registry-unavailable' };
  }
  return {
    current,
    latest,
    updateAvailable: isNewerVersion(latest, current),
    skipped: false,
  };
}
