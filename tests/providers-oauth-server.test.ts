import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  exchangeCode,
  loginWithChatGPT,
  mintApiKey,
  OPENAI_PUBLIC_CLIENT_ID,
  startCallbackServer,
} from '../src/auth/oauth.js';
import { loadTokens } from '../src/auth/tokens.js';

interface IssuerCall {
  grant: string;
  params: Record<string, string>;
  contentType: string;
}

interface MockIssuer {
  base: string;
  calls: IssuerCall[];
  close(): Promise<void>;
}

type IssuerResponder = (call: IssuerCall) => { status: number; body: unknown };

function startIssuer(respond: IssuerResponder): Promise<MockIssuer> {
  const calls: IssuerCall[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const contentType = req.headers['content-type'] ?? '';
      let params: Record<string, string> = {};
      if (contentType.includes('json')) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        for (const [k, v] of Object.entries(parsed)) {
          params[k] = String(v);
        }
      } else {
        params = Object.fromEntries(new URLSearchParams(raw));
      }
      const call: IssuerCall = { grant: params.grant_type ?? '', params, contentType };
      calls.push(call);
      const out = respond(call);
      res.writeHead(out.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out.body));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr !== null && typeof addr === 'object' ? addr.port : 0;
      resolve({
        base: `http://127.0.0.1:${port}`,
        calls,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

function fakeIdToken(accountId: string, plan: string): string {
  const seg = (obj: unknown): string => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${seg({ alg: 'none' })}.${seg({
    'https://api.openai.com/auth': {
      chatgpt_account_id: accountId,
      chatgpt_plan_type: plan,
    },
  })}.sig`;
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-oauth-'));
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

describe('callback server', () => {
  it('serves the friendly success page and resolves the code', async () => {
    const server = await startCallbackServer('good-state', 0);
    const res = await fetch(
      `http://127.0.0.1:${server.port}/auth/callback?code=abc-123&state=good-state`,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('You are signed in!');
    expect(html).toContain('You can close this tab.');
    await expect(server.code).resolves.toBe('abc-123');
  });

  it('rejects on a state mismatch with a 400 page', async () => {
    const server = await startCallbackServer('good-state', 0);
    const res = await fetch(
      `http://127.0.0.1:${server.port}/auth/callback?code=abc-123&state=evil-state`,
    );
    expect(res.status).toBe(400);
    await expect(server.code).rejects.toThrow('oauth-state-mismatch');
  });

  it('rejects when the provider sends an error parameter', async () => {
    const server = await startCallbackServer('good-state', 0);
    const res = await fetch(
      `http://127.0.0.1:${server.port}/auth/callback?error=access_denied&state=good-state`,
    );
    expect(res.status).toBe(400);
    await expect(server.code).rejects.toThrow('oauth-error:access_denied');
  });

  it('falls back to a higher port when the preferred one is busy', async () => {
    const blocker = http.createServer();
    await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', () => r()));
    const addr = blocker.address();
    const blockedPort = addr !== null && typeof addr === 'object' ? addr.port : 0;
    try {
      const server = await startCallbackServer('s', blockedPort);
      expect(server.port).not.toBe(blockedPort);
      expect(server.port).toBeGreaterThan(blockedPort);
      expect(server.port).toBeLessThanOrEqual(blockedPort + 9);
      expect(server.redirectUri).toBe(`http://localhost:${server.port}/auth/callback`);
      server.close();
      await expect(server.code).rejects.toThrow('oauth-callback-closed');
    } finally {
      blocker.close();
    }
  });
});

describe('exchangeCode', () => {
  it('posts form-encoded params and returns the token set', async () => {
    const issuer = await startIssuer(() => ({
      status: 200,
      body: {
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        id_token: fakeIdToken('acct-1', 'free'),
        expires_in: 3600,
      },
    }));
    try {
      const pkce = { verifier: 'my-verifier', challenge: 'c', state: 's' };
      const set = await exchangeCode(
        'the-code',
        pkce,
        'http://localhost:1455/auth/callback',
        fetch,
        issuer.base,
      );
      expect(set.access_token).toBe('access-1');
      expect(set.refresh_token).toBe('refresh-1');
      expect(set.expires_in).toBe(3600);
      expect(issuer.calls).toHaveLength(1);
      const call = issuer.calls[0]!;
      expect(call.contentType).toContain('application/x-www-form-urlencoded');
      expect(call.params).toMatchObject({
        grant_type: 'authorization_code',
        code: 'the-code',
        redirect_uri: 'http://localhost:1455/auth/callback',
        client_id: OPENAI_PUBLIC_CLIENT_ID,
        code_verifier: 'my-verifier',
      });
    } finally {
      await issuer.close();
    }
  });

  it('throws on a non-2xx response without echoing the body', async () => {
    const issuer = await startIssuer(() => ({ status: 400, body: { error: 'bad_code_secret' } }));
    try {
      const pkce = { verifier: 'v', challenge: 'c', state: 's' };
      await expect(
        exchangeCode('x', pkce, 'http://localhost:1455/auth/callback', fetch, issuer.base),
      ).rejects.toThrow('oauth-token-exchange-failed:http-400');
    } finally {
      await issuer.close();
    }
  });
});

describe('mintApiKey', () => {
  it('returns the minted key on success', async () => {
    const issuer = await startIssuer((call) => {
      expect(call.params.grant_type).toBe('urn:ietf:params:oauth:grant-type:token-exchange');
      expect(call.params.requested_token).toBe('openai-api-key');
      expect(call.params.subject_token_type).toBe('urn:ietf:params:oauth:token-type:id_token');
      return { status: 200, body: { access_token: 'sk-minted-1' } };
    });
    try {
      await expect(mintApiKey(fakeIdToken('a', 'free'), fetch, issuer.base)).resolves.toBe(
        'sk-minted-1',
      );
    } finally {
      await issuer.close();
    }
  });

  it('returns null on a 403 and never throws', async () => {
    const issuer = await startIssuer(() => ({ status: 403, body: { error: 'nope' } }));
    try {
      await expect(mintApiKey(fakeIdToken('a', 'free'), fetch, issuer.base)).resolves.toBeNull();
    } finally {
      await issuer.close();
    }
  });

  it('returns null when fetch itself fails', async () => {
    const failingFetch = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    await expect(mintApiKey(fakeIdToken('a', 'free'), failingFetch)).resolves.toBeNull();
  });
});

describe('loginWithChatGPT', () => {
  it('runs the whole flow against a mock issuer and persists tokens', async () => {
    const issuer = await startIssuer((call) => {
      if (call.grant === 'authorization_code') {
        return {
          status: 200,
          body: {
            access_token: 'access-login',
            refresh_token: 'refresh-login',
            id_token: fakeIdToken('acct-login', 'free'),
            expires_in: 3600,
          },
        };
      }
      return { status: 200, body: { access_token: 'sk-minted-login' } };
    });
    try {
      let authorizeUrl = '';
      const login = loginWithChatGPT({
        openBrowser: false,
        fetchImpl: fetch,
        issuerBase: issuer.base,
        preferredPort: 0,
        onAuthorizeUrl: (url) => {
          authorizeUrl = url;
        },
      });
      while (authorizeUrl === '') {
        await delay(10);
      }
      const url = new URL(authorizeUrl);
      expect(url.origin).toBe(issuer.base);
      const state = url.searchParams.get('state')!;
      const redirectUri = url.searchParams.get('redirect_uri')!;
      const cb = await fetch(`${redirectUri}?code=login-code&state=${state}`);
      expect(cb.status).toBe(200);

      const result = await login;
      expect(result).toEqual({ accountId: 'acct-login', planType: 'free' });

      const stored = loadTokens();
      expect(stored).not.toBeNull();
      expect(stored!.provider).toBe('openai-chatgpt');
      expect(stored!.access_token).toBe('access-login');
      expect(stored!.refresh_token).toBe('refresh-login');
      expect(stored!.account_id).toBe('acct-login');
      expect(stored!.plan_type).toBe('free');
      expect(stored!.minted_api_key).toBe('sk-minted-login');
      expect(stored!.expires_at).toBeGreaterThan(Date.now());
      expect(issuer.calls.map((c) => c.grant)).toEqual([
        'authorization_code',
        'urn:ietf:params:oauth:grant-type:token-exchange',
      ]);
    } finally {
      await issuer.close();
    }
  });
});
