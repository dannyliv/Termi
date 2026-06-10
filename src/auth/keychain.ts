/**
 * Secret storage for Termi.
 *
 * Primary backend: the OS keychain via @napi-rs/keyring (service "termi-cli").
 * Fallback backend: a JSON file at TERMI_HOME/secrets.json (mode 0o600,
 * atomic writes). The fallback activates in two ways:
 *
 *   1. Forced: env TERMI_KEYRING=file. Tests and CI use this so they never
 *      touch a real keychain.
 *   2. Tripped: the native keyring throws a platform error (for example a
 *      headless Linux box with no secret service). We then fall back
 *      transparently for the rest of the process.
 *
 * Accounts in use across Termi: "pin-hash", "setup-marker", "hmac-key",
 * "api-key-openai-api", "api-key-anthropic", "api-key-xai", "install-id".
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { atomicWriteFileSync, termiHome } from '../config/paths.js';

export const KEYCHAIN_SERVICE = 'termi-cli';

/** Keychain accounts that hold provider API keys. Wiped on PIN reset. */
export const API_KEY_ACCOUNTS = [
  'api-key-openai-api',
  'api-key-anthropic',
  'api-key-xai',
] as const;

interface EntryLike {
  getPassword(): string | null;
  setPassword(value: string): void;
  deleteCredential(): boolean;
}

type EntryCtor = new (service: string, account: string) => EntryLike;

/** undefined = not loaded yet; null = native module unavailable. */
let nativeEntryCtor: EntryCtor | null | undefined;
/** Set once the native keyring fails at runtime; sticky for the process. */
let fallbackTripped = false;

function forcedFallback(): boolean {
  return (process.env.TERMI_KEYRING ?? '').trim().toLowerCase() === 'file';
}

/** True when secrets are going to the JSON fallback file, not the OS keychain. */
export function isFallbackActive(): boolean {
  return forcedFallback() || fallbackTripped;
}

function loadNativeCtor(): EntryCtor | null {
  if (nativeEntryCtor !== undefined) {
    return nativeEntryCtor;
  }
  try {
    const requireNative = createRequire(import.meta.url);
    const mod = requireNative('@napi-rs/keyring') as { Entry: EntryCtor };
    nativeEntryCtor = mod.Entry;
  } catch {
    nativeEntryCtor = null;
    fallbackTripped = true;
  }
  return nativeEntryCtor;
}

/** "No matching entry" means the secret is absent, not that the platform broke. */
function isNoEntryError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /no matching entry/i.test(message) || /noentry/i.test(message);
}

function secretsFilePath(): string {
  return path.join(termiHome(), 'secrets.json');
}

function readFallbackStore(): Record<string, string> {
  try {
    const raw = fs.readFileSync(secretsFilePath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const store: Record<string, string> = {};
      for (const [account, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') {
          store[account] = value;
        }
      }
      return store;
    }
  } catch {
    // Missing or unreadable file means an empty store.
  }
  return {};
}

function writeFallbackStore(store: Record<string, string>): void {
  atomicWriteFileSync(secretsFilePath(), JSON.stringify(store, null, 2), 0o600);
}

/** Returns the stored secret, or null when there is none. */
export function getSecret(account: string): string | null {
  if (!isFallbackActive()) {
    const Ctor = loadNativeCtor();
    if (Ctor) {
      try {
        const entry = new Ctor(KEYCHAIN_SERVICE, account);
        return entry.getPassword() ?? null;
      } catch (err) {
        if (isNoEntryError(err)) {
          return null;
        }
        fallbackTripped = true;
      }
    }
  }
  return readFallbackStore()[account] ?? null;
}

/** Stores or replaces a secret. */
export function setSecret(account: string, value: string): void {
  if (!isFallbackActive()) {
    const Ctor = loadNativeCtor();
    if (Ctor) {
      try {
        const entry = new Ctor(KEYCHAIN_SERVICE, account);
        entry.setPassword(value);
        return;
      } catch {
        fallbackTripped = true;
      }
    }
  }
  const store = readFallbackStore();
  store[account] = value;
  writeFallbackStore(store);
}

/** Deletes a secret. Returns true when something was actually removed. */
export function deleteSecret(account: string): boolean {
  if (!isFallbackActive()) {
    const Ctor = loadNativeCtor();
    if (Ctor) {
      try {
        const entry = new Ctor(KEYCHAIN_SERVICE, account);
        return entry.deleteCredential();
      } catch (err) {
        if (isNoEntryError(err)) {
          return false;
        }
        fallbackTripped = true;
      }
    }
  }
  const store = readFallbackStore();
  if (!(account in store)) {
    return false;
  }
  delete store[account];
  writeFallbackStore(store);
  return true;
}
