import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locksDir } from '../src/config/paths.js';
import {
  AuthDeadError,
  clearTokens,
  getValidAccessToken,
  hasTokens,
  loadTokens,
  needsRefresh,
  saveTokens,
  type StoredTokens,
} from '../src/auth/tokens.js';

interface RefreshIssuer {
  base: string;
  /** Refresh tokens seen, in order. */
  seen: string[];
  close(): Promise<void>;
}

interface RefreshIssuerOptions {
  delayMs?: number;
  respond?: (refreshToken: string, callIndex: number) => { status: number; body: unknown };
}

function startRefreshIssuer(opts: RefreshIssuerOptions = {}): Promise<RefreshIssuer> {
  const seen: string[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, string>;
      const index = seen.length;
      seen.push(parsed.refresh_token ?? '');
      const out = opts.respond?.(parsed.refresh_token ?? '', index) ?? {
        status: 200,
        body: {
          access_token: `access-${index + 2}`,
          refresh_token: `refresh-${index + 2}`,
          expires_in: 1000,
        },
      };
      const send = (): void => {
        res.writeHead(out.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out.body));
      };
      if (opts.delayMs !== undefined) {
        setTimeout(send, opts.delayMs);
      } else {
        send();
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr !== null && typeof addr === 'object' ? addr.port : 0;
      resolve({
        base: `http://127.0.0.1:${port}`,
        seen,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

/** fetch wrapper that rewrites the issuer host to the mock server. */
function issuerFetch(base: string): typeof fetch {
  const impl = (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const rewritten = url.replace('https://auth.openai.com', base);
    return fetch(rewritten, init);
  };
  return impl as typeof fetch;
}

function tokensFixture(overrides: Partial<StoredTokens> = {}): StoredTokens {
  const now = Date.now();
  return {
    provider: 'openai-chatgpt',
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    id_token: '',
    account_id: 'acct-1',
    plan_type: 'free',
    issued_at: now - 90_000,
    expires_at: now + 10_000,
    ...overrides,
  };
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-tokens-'));
  for (const key of ['TERMI_HOME', 'TERMI_PROJECTS_DIR', 'TERMI_KEYRING']) {
    savedEnv[key] = process.env[key];
  }
  process.env.TERMI_HOME = path.join(tmpRoot, 'home');
  process.env.TERMI_PROJECTS_DIR = path.join(tmpRoot, 'projects');
  process.env.TERMI_KEYRING = 'file';
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('token store basics', () => {
  it('hasTokens and clearTokens round trip', () => {
    expect(hasTokens()).toBe(false);
    saveTokens(tokensFixture());
    expect(hasTokens()).toBe(true);
    clearTokens();
    expect(hasTokens()).toBe(false);
    expect(loadTokens()).toBeNull();
  });

  it('rejects malformed auth.json', () => {
    saveTokens(tokensFixture());
    const file = path.join(process.env.TERMI_HOME!, 'auth.json');
    fs.writeFileSync(file, '{"provider":"other"}');
    expect(loadTokens()).toBeNull();
  });

  it('throws AuthDeadError when no tokens exist', async () => {
    await expect(getValidAccessToken()).rejects.toBeInstanceOf(AuthDeadError);
  });
});

describe('proactive refresh at 80 percent', () => {
  it('returns the current token before the 80 percent point', async () => {
    const now = Date.now();
    // Lifetime 100s, 79s elapsed: still under the 80 percent point.
    saveTokens(tokensFixture({ issued_at: now - 79_000, expires_at: now + 21_000 }));
    const spy = vi.fn();
    const token = await getValidAccessToken(spy as unknown as typeof fetch);
    expect(token).toBe('access-1');
    expect(spy).not.toHaveBeenCalled();
  });

  it('needsRefresh flips exactly at the 80 percent point', () => {
    const t = tokensFixture({ issued_at: 0, expires_at: 100_000 });
    expect(needsRefresh(t, 79_999)).toBe(false);
    expect(needsRefresh(t, 80_000)).toBe(true);
    expect(needsRefresh(t, 200_000)).toBe(true);
  });

  it('refreshes past 80 percent and persists the rotation before returning', async () => {
    const issuer = await startRefreshIssuer();
    try {
      saveTokens(tokensFixture());
      const token = await getValidAccessToken(issuerFetch(issuer.base));
      expect(token).toBe('access-2');
      const stored = loadTokens()!;
      expect(stored.access_token).toBe('access-2');
      expect(stored.refresh_token).toBe('refresh-2');
      expect(stored.expires_at).toBeGreaterThan(Date.now());
      expect(issuer.seen).toEqual(['refresh-1']);

      // Force another refresh: the rotated refresh token must be the one sent.
      const again = loadTokens()!;
      saveTokens({
        ...again,
        issued_at: Date.now() - 90_000,
        expires_at: Date.now() + 10_000,
      });
      const token2 = await getValidAccessToken(issuerFetch(issuer.base));
      expect(token2).toBe('access-3');
      expect(issuer.seen).toEqual(['refresh-1', 'refresh-2']);
    } finally {
      await issuer.close();
    }
  });
});

describe('terminal refresh failures', () => {
  it('marks the store dead and throws AuthDeadError on refresh_token_reused', async () => {
    const issuer = await startRefreshIssuer({
      respond: () => ({ status: 400, body: { error: 'refresh_token_reused' } }),
    });
    try {
      saveTokens(tokensFixture());
      let caught: unknown;
      try {
        await getValidAccessToken(issuerFetch(issuer.base));
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AuthDeadError);
      expect((caught as AuthDeadError).reason).toBe('refresh_token_reused');
      // Token values never leak into the error.
      expect((caught as AuthDeadError).message).not.toContain('refresh-1');
      expect((caught as AuthDeadError).message).not.toContain('access-1');

      const stored = loadTokens()!;
      expect(stored.dead).toBe(true);
      expect(stored.deadReason).toBe('refresh_token_reused');

      // Subsequent calls fail fast without another network attempt.
      const spy = vi.fn();
      await expect(getValidAccessToken(spy as unknown as typeof fetch)).rejects.toBeInstanceOf(
        AuthDeadError,
      );
      expect(spy).not.toHaveBeenCalled();
      expect(issuer.seen).toHaveLength(1);
    } finally {
      await issuer.close();
    }
  });

  it('does not mark dead on a transient 500', async () => {
    const issuer = await startRefreshIssuer({
      respond: () => ({ status: 500, body: { error: 'oops' } }),
    });
    try {
      saveTokens(tokensFixture());
      await expect(getValidAccessToken(issuerFetch(issuer.base))).rejects.toThrow(
        'Token refresh failed (http-500)',
      );
      expect(loadTokens()!.dead).toBeUndefined();
    } finally {
      await issuer.close();
    }
  });
});

describe('single flight', () => {
  it('two concurrent calls produce exactly one refresh request', async () => {
    const issuer = await startRefreshIssuer({ delayMs: 150 });
    try {
      saveTokens(tokensFixture());
      const f = issuerFetch(issuer.base);
      const [a, b] = await Promise.all([getValidAccessToken(f), getValidAccessToken(f)]);
      expect(a).toBe('access-2');
      expect(b).toBe('access-2');
      expect(issuer.seen).toHaveLength(1);
    } finally {
      await issuer.close();
    }
  });
});

describe('cross-process lockfile', () => {
  it('waits on a fresh lock, then re-reads instead of refreshing', async () => {
    saveTokens(tokensFixture());
    fs.mkdirSync(locksDir(), { recursive: true });
    const lockFile = path.join(locksDir(), 'auth.lock');
    fs.writeFileSync(lockFile, JSON.stringify({ pid: 99999, at: Date.now() }));

    const spy = vi.fn(() => Promise.reject(new Error('must not refresh')));
    const pending = getValidAccessToken(spy as unknown as typeof fetch);

    // Simulate the other process: it refreshes, persists, then releases.
    await delay(250);
    const now = Date.now();
    saveTokens(
      tokensFixture({
        access_token: 'access-other-process',
        refresh_token: 'refresh-other-process',
        issued_at: now,
        expires_at: now + 1_000_000,
      }),
    );
    fs.rmSync(lockFile);

    await expect(pending).resolves.toBe('access-other-process');
    expect(spy).not.toHaveBeenCalled();
  });

  it('takes over a stale lock older than 30 seconds', async () => {
    const issuer = await startRefreshIssuer();
    try {
      saveTokens(tokensFixture());
      fs.mkdirSync(locksDir(), { recursive: true });
      const lockFile = path.join(locksDir(), 'auth.lock');
      fs.writeFileSync(lockFile, JSON.stringify({ pid: 99999, at: Date.now() - 60_000 }));
      const past = (Date.now() - 60_000) / 1000;
      fs.utimesSync(lockFile, past, past);

      const token = await getValidAccessToken(issuerFetch(issuer.base));
      expect(token).toBe('access-2');
      expect(issuer.seen).toHaveLength(1);
      // The lock is released after the refresh.
      expect(fs.existsSync(lockFile)).toBe(false);
    } finally {
      await issuer.close();
    }
  });
});
