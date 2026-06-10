/**
 * ChatGPT sign-in flow (OAuth 2.0 + PKCE) for the openai-chatgpt provider.
 *
 * The authorize URL, token endpoints, and wire values follow the OAuth
 * protocol spec for OpenAI's public CLI app client id. The issuer base is
 * injectable so tests can point every endpoint at a local mock server.
 * Token values never appear in error messages or logs.
 */

import crypto from 'node:crypto';
import http from 'node:http';
import { saveTokens, type StoredTokens } from './tokens.js';

/** OAuth client id published by OpenAI for its CLI app. Protocol constant. */
export const OPENAI_PUBLIC_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

/** Default OAuth issuer. Tests override this with a local mock server. */
export const DEFAULT_ISSUER_BASE = 'https://auth.openai.com';

/** Originator value the wire protocol requires on requests. */
export const PROTOCOL_ORIGINATOR = 'codex_cli_rs';

/** Fallback access token lifetime when the server does not say: 10 days. */
const DEFAULT_LIFETIME_MS = 10 * 24 * 60 * 60 * 1000;

const CALLBACK_PATH = '/auth/callback';
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
const PORT_FALLBACK_RANGE = 9;

export type FetchLike = typeof globalThis.fetch;

export interface PkcePair {
  verifier: string;
  challenge: string;
  state: string;
}

export interface TokenSetRaw {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  /** Seconds, when the token endpoint includes it. */
  expires_in?: number;
}

export interface IdTokenInfo {
  accountId: string;
  planType: string;
}

/** Thrown by refreshTokens. kind "auth-dead" means sign in again is required. */
export class OAuthRefreshError extends Error {
  readonly kind: 'auth-dead' | 'transient';
  readonly reason: string;

  constructor(kind: 'auth-dead' | 'transient', reason: string) {
    super(`Token refresh failed (${reason})`);
    this.name = 'OAuthRefreshError';
    this.kind = kind;
    this.reason = reason;
  }
}

/** RFC 7636 S256: base64url of the SHA-256 of the ASCII verifier. */
export function s256Challenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** Random S256 verifier and challenge plus a random 32 byte base64url state. */
export function generatePkce(): PkcePair {
  const verifier = crypto.randomBytes(64).toString('base64url');
  return {
    verifier,
    challenge: s256Challenge(verifier),
    state: crypto.randomBytes(32).toString('base64url'),
  };
}

/** Builds the browser authorize URL for the ChatGPT sign-in. */
export function buildAuthorizeUrl(
  pkce: PkcePair,
  port: number,
  issuerBase: string = DEFAULT_ISSUER_BASE,
): string {
  const url = new URL('/oauth/authorize', issuerBase);
  const params = url.searchParams;
  params.set('response_type', 'code');
  params.set('client_id', OPENAI_PUBLIC_CLIENT_ID);
  params.set('redirect_uri', `http://localhost:${port}${CALLBACK_PATH}`);
  params.set('scope', 'openid profile email offline_access');
  params.set('code_challenge', pkce.challenge);
  params.set('code_challenge_method', 'S256');
  params.set('id_token_add_organizations', 'true');
  params.set('codex_cli_simplified_flow', 'true');
  params.set('state', pkce.state);
  params.set('originator', PROTOCOL_ORIGINATOR);
  return url.toString();
}

const SUCCESS_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>Termi</title></head>' +
  '<body style="font-family: sans-serif; text-align: center; padding-top: 4rem;">' +
  '<h1>You are signed in!</h1><p>You can close this tab.</p></body></html>';

const FAILURE_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>Termi</title></head>' +
  '<body style="font-family: sans-serif; text-align: center; padding-top: 4rem;">' +
  '<h1>That sign-in did not work.</h1><p>Close this tab and try again.</p></body></html>';

export interface CallbackServer {
  port: number;
  redirectUri: string;
  /** Resolves with the authorization code, or rejects on mismatch or timeout. */
  code: Promise<string>;
  close(): void;
}

function tryListen(server: http.Server, port: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      server.removeListener('listening', onListening);
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(null);
      } else {
        reject(err);
      }
    };
    const onListening = (): void => {
      server.removeListener('error', onError);
      const addr = server.address();
      resolve(addr !== null && typeof addr === 'object' ? addr.port : port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Starts the loopback callback server for the browser redirect.
 * Tries preferredPort, then up to nine higher ports. Binds 127.0.0.1 only.
 */
export async function startCallbackServer(
  expectedState: string,
  preferredPort = 1455,
  timeoutMs = CALLBACK_TIMEOUT_MS,
): Promise<CallbackServer> {
  let settled = false;
  let resolveCode!: (code: string) => void;
  let rejectCode!: (err: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Keep an always-on handler so an unobserved rejection never crashes.
  void codePromise.catch(() => undefined);

  const settleResolve = (code: string): void => {
    if (!settled) {
      settled = true;
      resolveCode(code);
    }
  };
  const settleReject = (err: Error): void => {
    if (!settled) {
      settled = true;
      rejectCode(err);
    }
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== CALLBACK_PATH) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const errorParam = url.searchParams.get('error');
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (errorParam !== null) {
      res.writeHead(400, { 'content-type': 'text/html' });
      res.end(FAILURE_HTML, () => setImmediate(shutdown));
      settleReject(new Error(`oauth-error:${errorParam}`));
      return;
    }
    if (state === null || state !== expectedState || code === null || code.length === 0) {
      res.writeHead(400, { 'content-type': 'text/html' });
      res.end(FAILURE_HTML, () => setImmediate(shutdown));
      settleReject(new Error('oauth-state-mismatch'));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(SUCCESS_HTML, () => setImmediate(shutdown));
    settleResolve(code);
  });

  const timer = setTimeout(() => {
    settleReject(new Error('oauth-callback-timeout'));
    shutdown();
  }, timeoutMs);
  timer.unref();

  function shutdown(): void {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  }

  const candidates =
    preferredPort === 0
      ? [0]
      : Array.from({ length: PORT_FALLBACK_RANGE + 1 }, (_, i) => preferredPort + i);
  let boundPort: number | null = null;
  for (const candidate of candidates) {
    boundPort = await tryListen(server, candidate);
    if (boundPort !== null) {
      break;
    }
  }
  if (boundPort === null) {
    clearTimeout(timer);
    settleReject(new Error('oauth-callback-no-port'));
    throw new Error('oauth-callback-no-port');
  }

  return {
    port: boundPort,
    redirectUri: `http://localhost:${boundPort}${CALLBACK_PATH}`,
    code: codePromise,
    close(): void {
      settleReject(new Error('oauth-callback-closed'));
      shutdown();
    },
  };
}

function asTokenSet(data: Record<string, unknown>): TokenSetRaw {
  if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
    throw new Error('oauth-token-response-missing-access-token');
  }
  const set: TokenSetRaw = { access_token: data.access_token };
  if (typeof data.refresh_token === 'string' && data.refresh_token.length > 0) {
    set.refresh_token = data.refresh_token;
  }
  if (typeof data.id_token === 'string' && data.id_token.length > 0) {
    set.id_token = data.id_token;
  }
  if (typeof data.expires_in === 'number' && Number.isFinite(data.expires_in)) {
    set.expires_in = data.expires_in;
  }
  return set;
}

/** Exchanges the authorization code for tokens. Form-encoded per the spec. */
export async function exchangeCode(
  code: string,
  pkce: PkcePair,
  redirectUri: string,
  fetchImpl: FetchLike = globalThis.fetch,
  issuerBase: string = DEFAULT_ISSUER_BASE,
): Promise<TokenSetRaw> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: OPENAI_PUBLIC_CLIENT_ID,
    code_verifier: pkce.verifier,
  });
  const res = await fetchImpl(`${issuerBase}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`oauth-token-exchange-failed:http-${res.status}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return asTokenSet(data);
}

function jwtPayload(token: string): Record<string, unknown> | null {
  const segment = token.split('.')[1];
  if (segment === undefined || segment.length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to null.
  }
  return null;
}

/**
 * Plain base64url decode of the id_token payload. No signature check is
 * needed client side: the token came straight from the issuer over TLS.
 */
export function decodeIdToken(idToken: string): IdTokenInfo {
  const payload = jwtPayload(idToken);
  if (payload === null) {
    throw new Error('id-token-decode-failed');
  }
  const authClaim = payload['https://api.openai.com/auth'];
  const claims =
    authClaim !== null && typeof authClaim === 'object' && !Array.isArray(authClaim)
      ? (authClaim as Record<string, unknown>)
      : {};
  return {
    accountId: typeof claims.chatgpt_account_id === 'string' ? claims.chatgpt_account_id : '',
    planType: typeof claims.chatgpt_plan_type === 'string' ? claims.chatgpt_plan_type : 'unknown',
  };
}

const TERMINAL_REFRESH_PATTERN = /refresh_token_(expired|reused|invalidated)/;

/**
 * Refreshes the token set. The refresh token rotates: callers must persist
 * the new one before first use. Terminal failures throw kind "auth-dead".
 */
export async function refreshTokens(
  refreshToken: string,
  fetchImpl: FetchLike = globalThis.fetch,
  issuerBase: string = DEFAULT_ISSUER_BASE,
): Promise<TokenSetRaw> {
  const res = await fetchImpl(`${issuerBase}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: OPENAI_PUBLIC_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      // Body is best effort; classification falls back to the status.
    }
    const terminal = bodyText.match(TERMINAL_REFRESH_PATTERN);
    if (terminal !== null) {
      throw new OAuthRefreshError('auth-dead', terminal[0]);
    }
    if (/invalid_grant/.test(bodyText)) {
      throw new OAuthRefreshError('auth-dead', 'invalid_grant');
    }
    throw new OAuthRefreshError('transient', `http-${res.status}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return asTokenSet(data);
}

/**
 * RFC 8693 token exchange: tries to mint a platform API key from the
 * id_token. Best effort only. Returns the key or null. Never throws.
 */
export async function mintApiKey(
  idToken: string,
  fetchImpl: FetchLike = globalThis.fetch,
  issuerBase: string = DEFAULT_ISSUER_BASE,
): Promise<string | null> {
  try {
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: OPENAI_PUBLIC_CLIENT_ID,
      requested_token: 'openai-api-key',
      subject_token: idToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    });
    const res = await fetchImpl(`${issuerBase}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    for (const field of ['access_token', 'api_key', 'key']) {
      const value = data[field];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  } catch {
    // Best effort: any failure simply means no minted key.
  }
  return null;
}

function computeExpiresAt(set: TokenSetRaw, now: number): number {
  if (set.expires_in !== undefined) {
    return now + set.expires_in * 1000;
  }
  const payload = jwtPayload(set.access_token);
  const exp = payload?.exp;
  if (typeof exp === 'number' && Number.isFinite(exp)) {
    return exp * 1000;
  }
  return now + DEFAULT_LIFETIME_MS;
}

export interface LoginOptions {
  /** Open the system browser at the authorize URL. Default true. */
  openBrowser?: boolean;
  fetchImpl?: FetchLike;
  /** Override every OAuth endpoint base. Tests point this at 127.0.0.1. */
  issuerBase?: string;
  preferredPort?: number;
  timeoutMs?: number;
  /** Receives the authorize URL so callers can show or log it. */
  onAuthorizeUrl?: (url: string) => void;
}

export interface LoginResult {
  accountId: string;
  planType: string;
}

/**
 * Full ChatGPT sign-in: callback server, authorize URL, browser, code
 * exchange, best effort API key mint, then persist via tokens.ts.
 */
export async function loginWithChatGPT(opts: LoginOptions = {}): Promise<LoginResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const issuerBase = opts.issuerBase ?? DEFAULT_ISSUER_BASE;
  const pkce = generatePkce();
  const server = await startCallbackServer(
    pkce.state,
    opts.preferredPort ?? 1455,
    opts.timeoutMs ?? CALLBACK_TIMEOUT_MS,
  );
  try {
    const authorizeUrl = buildAuthorizeUrl(pkce, server.port, issuerBase);
    opts.onAuthorizeUrl?.(authorizeUrl);
    if (opts.openBrowser !== false) {
      try {
        const mod = await import('open');
        await mod.default(authorizeUrl);
      } catch {
        // The URL was already handed to onAuthorizeUrl; manual open still works.
      }
    }
    const code = await server.code;
    const set = await exchangeCode(code, pkce, server.redirectUri, fetchImpl, issuerBase);
    if (set.id_token === undefined) {
      throw new Error('oauth-login-missing-id-token');
    }
    const info = decodeIdToken(set.id_token);
    const minted = await mintApiKey(set.id_token, fetchImpl, issuerBase);
    const now = Date.now();
    const stored: StoredTokens = {
      provider: 'openai-chatgpt',
      access_token: set.access_token,
      refresh_token: set.refresh_token ?? '',
      id_token: set.id_token,
      account_id: info.accountId,
      plan_type: info.planType,
      expires_at: computeExpiresAt(set, now),
      issued_at: now,
    };
    if (minted !== null) {
      stored.minted_api_key = minted;
    }
    saveTokens(stored);
    return { accountId: info.accountId, planType: info.planType };
  } finally {
    server.close();
  }
}
