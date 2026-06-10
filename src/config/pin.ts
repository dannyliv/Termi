/**
 * Parent PIN: scrypt hashed in the keychain, with a lockout after repeated
 * failures and a reset path that wipes provider credentials.
 *
 * Storage:
 *   - keychain "pin-hash": "<saltHex>:<hashHex>" (16-byte salt, scrypt
 *     N=16384 r=8 p=1, 64-byte key)
 *   - keychain "setup-marker": set when the wizard completes; survives
 *     deletion of the TERMI_HOME directory so recovery stays PIN gated
 *   - TERMI_HOME/pin.lock: JSON { failures, lockedUntil } tracking
 *     consecutive failures and the active lockout, shared across processes
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  API_KEY_ACCOUNTS,
  deleteSecret,
  getSecret,
  setSecret,
} from '../auth/keychain.js';
import { atomicWriteFileSync, authJsonPath, termiHome } from './paths.js';

const PIN_ACCOUNT = 'pin-hash';
const SETUP_MARKER_ACCOUNT = 'setup-marker';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

const MAX_FAILURES = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

export interface PinVerifyResult {
  ok: boolean;
  /** Present while a lockout is active. Seconds until tries are allowed again. */
  lockedForSeconds?: number;
}

interface LockState {
  failures: number;
  lockedUntil: number | null;
}

function lockFilePath(): string {
  return path.join(termiHome(), 'pin.lock');
}

function readLockState(): LockState {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(lockFilePath(), 'utf8'));
    if (parsed !== null && typeof parsed === 'object') {
      const candidate = parsed as { failures?: unknown; lockedUntil?: unknown };
      const failures = typeof candidate.failures === 'number' ? candidate.failures : 0;
      const lockedUntil = typeof candidate.lockedUntil === 'number' ? candidate.lockedUntil : null;
      return { failures, lockedUntil };
    }
  } catch {
    // Missing or unreadable lock file means a clean slate.
  }
  return { failures: 0, lockedUntil: null };
}

function writeLockState(state: LockState): void {
  atomicWriteFileSync(lockFilePath(), JSON.stringify(state), 0o600);
}

function clearLockState(): void {
  try {
    fs.rmSync(lockFilePath(), { force: true });
  } catch {
    // Best effort; a stale zero-failure file is harmless.
  }
}

function hashPin(pin: string, salt: Buffer): Buffer {
  return crypto.scryptSync(pin, salt, KEY_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

/** Stores the PIN hash and clears any previous lockout state. */
export function setPin(pin: string): void {
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = hashPin(pin, salt);
  setSecret(PIN_ACCOUNT, `${salt.toString('hex')}:${hash.toString('hex')}`);
  clearLockState();
}

export function hasPin(): boolean {
  return getSecret(PIN_ACCOUNT) !== null;
}

function pinMatches(pin: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [saltHex, hashHex] = parts;
  if (!saltHex || !hashHex) {
    return false;
  }
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) {
    return false;
  }
  const actual = hashPin(pin, salt);
  return crypto.timingSafeEqual(actual, expected);
}

/**
 * Verifies the PIN with constant-time comparison.
 * Five consecutive failures lock verification for five minutes.
 */
export function verifyPin(pin: string): PinVerifyResult {
  const now = Date.now();
  let lock = readLockState();

  if (lock.lockedUntil !== null) {
    if (now < lock.lockedUntil) {
      return {
        ok: false,
        lockedForSeconds: Math.ceil((lock.lockedUntil - now) / 1000),
      };
    }
    // Lockout expired: start a fresh counting window.
    lock = { failures: 0, lockedUntil: null };
    writeLockState(lock);
  }

  const stored = getSecret(PIN_ACCOUNT);
  if (stored === null) {
    return { ok: false };
  }

  if (pinMatches(pin, stored)) {
    clearLockState();
    return { ok: true };
  }

  const failures = lock.failures + 1;
  if (failures >= MAX_FAILURES) {
    const lockedUntil = now + LOCKOUT_MS;
    writeLockState({ failures, lockedUntil });
    return { ok: false, lockedForSeconds: Math.ceil(LOCKOUT_MS / 1000) };
  }
  writeLockState({ failures, lockedUntil: null });
  return { ok: false };
}

/**
 * Forgot-PIN path: wipes the PIN hash, every provider API key, and the OAuth
 * token file, so resetting gains the kid nothing. Returns the wiped item
 * names. The caller writes the audit entry and reverts settings to strict.
 */
export function resetPin(): string[] {
  const wiped: string[] = [];
  if (deleteSecret(PIN_ACCOUNT)) {
    wiped.push(PIN_ACCOUNT);
  }
  for (const account of API_KEY_ACCOUNTS) {
    if (deleteSecret(account)) {
      wiped.push(account);
    }
  }
  const authFile = authJsonPath();
  if (fs.existsSync(authFile)) {
    fs.rmSync(authFile, { force: true });
    wiped.push(path.basename(authFile));
  }
  clearLockState();
  return wiped;
}

/** Records that the setup wizard finished. Lives in the keychain on purpose. */
export function markSetupComplete(): void {
  setSecret(SETUP_MARKER_ACCOUNT, new Date().toISOString());
}

export function isSetupComplete(): boolean {
  return getSecret(SETUP_MARKER_ACCOUNT) !== null;
}
