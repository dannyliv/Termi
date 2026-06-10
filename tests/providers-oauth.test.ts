import { describe, expect, it } from 'vitest';
import {
  buildAuthorizeUrl,
  decodeIdToken,
  generatePkce,
  OPENAI_PUBLIC_CLIENT_ID,
  s256Challenge,
} from '../src/auth/oauth.js';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function fakeIdToken(payload: Record<string, unknown>): string {
  const seg = (obj: unknown): string => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${seg({ alg: 'none' })}.${seg(payload)}.signature`;
}

describe('PKCE generation', () => {
  it('produces a base64url verifier of 86 chars', () => {
    const pkce = generatePkce();
    expect(pkce.verifier).toHaveLength(86);
    expect(pkce.verifier).toMatch(BASE64URL);
  });

  it('produces a 43 char base64url challenge and state', () => {
    const pkce = generatePkce();
    expect(pkce.challenge).toHaveLength(43);
    expect(pkce.challenge).toMatch(BASE64URL);
    expect(pkce.state).toHaveLength(43);
    expect(pkce.state).toMatch(BASE64URL);
  });

  it('challenge is the S256 of the verifier', () => {
    const pkce = generatePkce();
    expect(pkce.challenge).toBe(s256Challenge(pkce.verifier));
  });

  it('is random across calls', () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.state).not.toBe(b.state);
  });

  it('matches the RFC 7636 appendix B vector', () => {
    expect(s256Challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('authorize URL', () => {
  const pkce = { verifier: 'VERIFIER', challenge: 'CHALL', state: 'STATE' };

  it('has the exact parameter set in order', () => {
    expect(buildAuthorizeUrl(pkce, 1455)).toBe(
      'https://auth.openai.com/oauth/authorize' +
        '?response_type=code' +
        `&client_id=${OPENAI_PUBLIC_CLIENT_ID}` +
        '&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback' +
        '&scope=openid+profile+email+offline_access' +
        '&code_challenge=CHALL' +
        '&code_challenge_method=S256' +
        '&id_token_add_organizations=true' +
        '&codex_cli_simplified_flow=true' +
        '&state=STATE' +
        '&originator=codex_cli_rs',
    );
  });

  it('reflects the callback port in redirect_uri', () => {
    const url = new URL(buildAuthorizeUrl(pkce, 1460));
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:1460/auth/callback');
  });

  it('honors an issuer base override', () => {
    const url = buildAuthorizeUrl(pkce, 1455, 'http://127.0.0.1:9999');
    expect(url.startsWith('http://127.0.0.1:9999/oauth/authorize?')).toBe(true);
  });
});

describe('decodeIdToken', () => {
  it('reads account id and plan from the auth claim', () => {
    const token = fakeIdToken({
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'acct-123',
        chatgpt_plan_type: 'free',
      },
    });
    expect(decodeIdToken(token)).toEqual({ accountId: 'acct-123', planType: 'free' });
  });

  it('falls back to empty account and unknown plan when the claim is missing', () => {
    const token = fakeIdToken({ sub: 'someone' });
    expect(decodeIdToken(token)).toEqual({ accountId: '', planType: 'unknown' });
  });

  it('throws on a malformed token', () => {
    expect(() => decodeIdToken('not-a-jwt')).toThrow('id-token-decode-failed');
    expect(() => decodeIdToken('a.!!!.c')).toThrow('id-token-decode-failed');
  });
});
