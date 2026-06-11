import { APICallError, RetryError } from 'ai';
import { describe, expect, it } from 'vitest';
import { classifyProviderError, describeForKid } from '../src/providers/errors.js';
import { T } from '../src/ui/text.js';

function apiError(statusCode: number, responseHeaders?: Record<string, string>): APICallError {
  return new APICallError({
    message: `HTTP ${statusCode}`,
    url: 'https://example.test/v1/responses',
    requestBodyValues: {},
    statusCode,
    responseHeaders,
  });
}

describe('classifyProviderError', () => {
  it('maps 429 with retry-after seconds to rate-limit', () => {
    const result = classifyProviderError(apiError(429, { 'retry-after': '120' }));
    expect(result).toEqual({ kind: 'rate-limit', retryAfter: 120 });
  });

  it('reads the backend reset header when retry-after is absent', () => {
    const result = classifyProviderError(
      apiError(429, { 'x-codex-primary-reset-after-seconds': '2592000' }),
    );
    expect(result).toEqual({ kind: 'rate-limit', retryAfter: 2592000 });
  });

  it('parses duration style x-ratelimit headers', () => {
    const result = classifyProviderError(
      apiError(429, { 'x-ratelimit-reset-requests': '1m30s' }),
    );
    expect(result).toEqual({ kind: 'rate-limit', retryAfter: 90 });
  });

  it('maps 429 without headers to rate-limit with no retryAfter', () => {
    const result = classifyProviderError(apiError(429));
    expect(result.kind).toBe('rate-limit');
    expect(result.retryAfter).toBeUndefined();
  });

  it('unwraps a RetryError and classifies the last underlying error', () => {
    const inner = apiError(429, { 'retry-after': '45' });
    const wrapped = new RetryError({
      message: 'Failed after 3 attempts.',
      reason: 'maxRetriesExceeded',
      errors: [apiError(429), inner],
    });
    expect(classifyProviderError(wrapped)).toEqual({ kind: 'rate-limit', retryAfter: 45 });
  });

  it('maps 401 and 403 to auth', () => {
    expect(classifyProviderError(apiError(401)).kind).toBe('auth');
    expect(classifyProviderError(apiError(403)).kind).toBe('auth');
  });

  it('maps 5xx to server', () => {
    expect(classifyProviderError(apiError(503)).kind).toBe('server');
    expect(classifyProviderError(apiError(500)).kind).toBe('server');
  });

  it('handles a raw fetch Response', () => {
    const res = new Response('too many', {
      status: 429,
      headers: { 'retry-after': '60' },
    });
    expect(classifyProviderError(res)).toEqual({ kind: 'rate-limit', retryAfter: 60 });
    expect(classifyProviderError(new Response('no', { status: 401 })).kind).toBe('auth');
    expect(classifyProviderError(new Response('boom', { status: 502 })).kind).toBe('server');
  });

  it('maps connection-refused style TypeErrors to network', () => {
    const err = new TypeError('fetch failed');
    (err as TypeError & { cause: unknown }).cause = { code: 'ECONNREFUSED' };
    expect(classifyProviderError(err).kind).toBe('network');
  });

  it('maps plain fetch TypeErrors and aborts to network', () => {
    expect(classifyProviderError(new TypeError('fetch failed')).kind).toBe('network');
    const abort = new Error('This operation was aborted');
    abort.name = 'AbortError';
    expect(classifyProviderError(abort).kind).toBe('network');
  });

  it('maps an APICallError without a status to network', () => {
    const err = new APICallError({
      message: 'socket hang up',
      url: 'https://example.test',
      requestBodyValues: {},
    });
    expect(classifyProviderError(err).kind).toBe('network');
  });

  it('passes through an already classified ProviderError', () => {
    expect(classifyProviderError({ kind: 'auth' })).toEqual({ kind: 'auth' });
    expect(classifyProviderError({ kind: 'rate-limit', retryAfter: 5 })).toEqual({
      kind: 'rate-limit',
      retryAfter: 5,
    });
  });

  it('falls back to server for unknown errors', () => {
    expect(classifyProviderError(new Error('strange internal thing')).kind).toBe('server');
  });
});

describe('describeForKid', () => {
  it('uses the quota copy with a reset time for rate limits', () => {
    const text = describeForKid(apiError(429, { 'retry-after': '3600' }));
    expect(text.startsWith('Termi used up its energy. It comes back at ')).toBe(true);
    expect(text).not.toContain('{time}');
  });

  it('uses the no-time quota copy when no reset is known', () => {
    expect(describeForKid(apiError(429))).toBe(T.quota.messageNoTime);
  });

  it('uses the auth, server, and network copy', () => {
    expect(describeForKid(apiError(401))).toBe(T.errors.auth);
    expect(describeForKid(apiError(500))).toBe(T.errors.server);
    expect(describeForKid(new TypeError('fetch failed'))).toBe(T.errors.network);
  });

  it('never echoes the provider error body', () => {
    const err = new APICallError({
      message: 'secret provider detail',
      url: 'https://example.test',
      requestBodyValues: {},
      statusCode: 500,
      responseBody: 'super secret stack trace',
    });
    const text = describeForKid(err);
    expect(text).not.toContain('secret');
    expect(text).toBe(T.errors.server);
  });
});
