/**
 * Maps anything a provider call can throw onto the small ProviderError
 * taxonomy {rate-limit, auth, server, network}. Provider error bodies are
 * never echoed to the kid; describeForKid only returns T registry copy.
 */

import { APICallError, RetryError } from 'ai';
import type { ProviderError } from '../types.js';
import { formatResetTime } from '../ui/errors.js';
import { T } from '../ui/text.js';

type HeaderGetter = (name: string) => string | null;

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EPIPE',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);

function isProviderError(err: unknown): err is ProviderError {
  if (err === null || typeof err !== 'object') {
    return false;
  }
  const kind = (err as { kind?: unknown }).kind;
  return kind === 'rate-limit' || kind === 'auth' || kind === 'server' || kind === 'network';
}

function isNetworkCode(code: unknown): boolean {
  return typeof code === 'string' && (NETWORK_ERROR_CODES.has(code) || code.startsWith('UND_ERR'));
}

function isNetworkish(err: unknown): boolean {
  if (err === null || typeof err !== 'object') {
    return false;
  }
  const e = err as { name?: unknown; message?: unknown; code?: unknown; cause?: unknown };
  if (e.name === 'AbortError' || e.name === 'TimeoutError') {
    return true;
  }
  if (isNetworkCode(e.code)) {
    return true;
  }
  if (e.cause !== null && typeof e.cause === 'object') {
    if (isNetworkCode((e.cause as { code?: unknown }).code)) {
      return true;
    }
  }
  if (err instanceof TypeError) {
    // Global fetch surfaces connection failures as TypeError.
    return true;
  }
  if (
    typeof e.message === 'string' &&
    /fetch failed|network|socket hang up|getaddrinfo|aborted/i.test(e.message)
  ) {
    return true;
  }
  return false;
}

/** Parses "90", "1m30s", "500ms" style values into whole seconds. */
function parseDurationSeconds(value: string): number | undefined {
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) {
    return Math.max(0, Math.round(Number(v)));
  }
  const re = /(\d+(?:\.\d+)?)(ms|s|m|h|d)/g;
  let total = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v)) !== null) {
    const amount = Number(m[1] ?? '0');
    const unit = m[2] ?? 's';
    matched = true;
    switch (unit) {
      case 'ms':
        total += amount / 1000;
        break;
      case 's':
        total += amount;
        break;
      case 'm':
        total += amount * 60;
        break;
      case 'h':
        total += amount * 3600;
        break;
      case 'd':
        total += amount * 86400;
        break;
    }
  }
  return matched ? Math.max(0, Math.round(total)) : undefined;
}

function parseRetryAfter(get: HeaderGetter): number | undefined {
  const direct = get('retry-after');
  if (direct !== null && direct.length > 0) {
    if (/^\d+(\.\d+)?$/.test(direct.trim())) {
      return Math.max(0, Math.round(Number(direct)));
    }
    const asDate = Date.parse(direct);
    if (!Number.isNaN(asDate)) {
      return Math.max(0, Math.round((asDate - Date.now()) / 1000));
    }
  }
  const backendReset = get('x-codex-primary-reset-after-seconds');
  if (backendReset !== null && /^\d+(\.\d+)?$/.test(backendReset.trim())) {
    return Math.max(0, Math.round(Number(backendReset)));
  }
  for (const name of [
    'x-ratelimit-reset-after',
    'x-ratelimit-reset-requests',
    'x-ratelimit-reset-tokens',
  ]) {
    const value = get(name);
    if (value !== null && value.length > 0) {
      const parsed = parseDurationSeconds(value);
      if (parsed !== undefined) {
        return parsed;
      }
    }
  }
  return undefined;
}

function getterFromRecord(headers: Record<string, string> | undefined): HeaderGetter {
  if (headers === undefined) {
    return () => null;
  }
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    map.set(key.toLowerCase(), value);
  }
  return (name) => map.get(name.toLowerCase()) ?? null;
}

function getterFromUnknown(headers: unknown): HeaderGetter {
  if (headers instanceof Headers) {
    return (name) => headers.get(name);
  }
  if (headers !== null && typeof headers === 'object' && !Array.isArray(headers)) {
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      if (typeof value === 'string') {
        record[key] = value;
      }
    }
    return getterFromRecord(record);
  }
  return () => null;
}

function fromStatus(status: number, get: HeaderGetter): ProviderError {
  if (status === 429) {
    const retryAfter = parseRetryAfter(get);
    return retryAfter !== undefined ? { kind: 'rate-limit', retryAfter } : { kind: 'rate-limit' };
  }
  if (status === 401 || status === 403) {
    return { kind: 'auth' };
  }
  if (status >= 500) {
    return { kind: 'server' };
  }
  return { kind: 'server' };
}

/** Classifies any thrown value from a provider call into a ProviderError. */
export function classifyProviderError(err: unknown): ProviderError {
  if (isProviderError(err)) {
    return err;
  }
  // The AI SDK wraps the real failure in a RetryError once retries run out.
  // Classify the last underlying error so a 429 still shows the quota screen.
  if (RetryError.isInstance(err) && err.lastError !== undefined) {
    return classifyProviderError(err.lastError);
  }
  if (APICallError.isInstance(err)) {
    if (err.statusCode !== undefined) {
      return fromStatus(err.statusCode, getterFromRecord(err.responseHeaders));
    }
    return { kind: 'network' };
  }
  if (err instanceof Response) {
    return fromStatus(err.status, (name) => err.headers.get(name));
  }
  if (err !== null && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const status =
      typeof o.statusCode === 'number'
        ? o.statusCode
        : typeof o.status === 'number'
          ? o.status
          : undefined;
    if (status !== undefined) {
      return fromStatus(status, getterFromUnknown(o.responseHeaders ?? o.headers));
    }
  }
  if (isNetworkish(err)) {
    return { kind: 'network' };
  }
  return { kind: 'server' };
}

/** Returns the kid copy from the T registry for this error. */
export function describeForKid(err: unknown): string {
  const classified = classifyProviderError(err);
  switch (classified.kind) {
    case 'rate-limit':
      return classified.retryAfter !== undefined
        ? T.quota.message.replace('{time}', formatResetTime(classified.retryAfter))
        : T.quota.messageNoTime;
    case 'auth':
      return T.errors.auth;
    case 'server':
      return T.errors.server;
    case 'network':
      return T.errors.network;
  }
}
