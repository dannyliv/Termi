import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasPin,
  isSetupComplete,
  markSetupComplete,
  resetPin,
  setPin,
  verifyPin,
} from '../src/config/pin.js';
import { getSecret, setSecret } from '../src/auth/keychain.js';
import { authJsonPath, termiHome } from '../src/config/paths.js';

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};
const START = new Date('2026-06-10T12:00:00.000Z');

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-pin-'));
  for (const key of ['TERMI_HOME', 'TERMI_PROJECTS_DIR', 'TERMI_KEYRING']) {
    savedEnv[key] = process.env[key];
  }
  process.env.TERMI_HOME = path.join(tmpRoot, 'home');
  process.env.TERMI_PROJECTS_DIR = path.join(tmpRoot, 'projects');
  process.env.TERMI_KEYRING = 'file';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('setPin / verifyPin', () => {
  it('verifies the right PIN and rejects a wrong one', () => {
    expect(hasPin()).toBe(false);
    setPin('4821');
    expect(hasPin()).toBe(true);
    expect(verifyPin('4821')).toEqual({ ok: true });
    expect(verifyPin('0000').ok).toBe(false);
  });

  it('stores a salted scrypt hash, never the raw PIN', () => {
    setPin('4821');
    const stored = getSecret('pin-hash');
    expect(stored).not.toBeNull();
    expect(stored).not.toContain('4821');
    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it('fails verification when no PIN was ever set', () => {
    expect(verifyPin('1234').ok).toBe(false);
  });

  it('locks after 5 consecutive failures and reports seconds remaining', () => {
    setPin('4821');
    for (let i = 0; i < 4; i += 1) {
      const attempt = verifyPin('9999');
      expect(attempt.ok).toBe(false);
      expect(attempt.lockedForSeconds).toBeUndefined();
    }
    const fifth = verifyPin('9999');
    expect(fifth.ok).toBe(false);
    expect(fifth.lockedForSeconds).toBe(300);
    expect(fs.existsSync(path.join(termiHome(), 'pin.lock'))).toBe(true);
  });

  it('rejects even the correct PIN while locked', () => {
    setPin('4821');
    for (let i = 0; i < 5; i += 1) {
      verifyPin('9999');
    }
    vi.setSystemTime(new Date(START.getTime() + 60_000));
    const locked = verifyPin('4821');
    expect(locked.ok).toBe(false);
    expect(locked.lockedForSeconds).toBe(240);
  });

  it('accepts the correct PIN after the lockout expires', () => {
    setPin('4821');
    for (let i = 0; i < 5; i += 1) {
      verifyPin('9999');
    }
    vi.setSystemTime(new Date(START.getTime() + 301_000));
    expect(verifyPin('4821')).toEqual({ ok: true });
  });

  it('resets the failure counter after a success', () => {
    setPin('4821');
    verifyPin('9999');
    verifyPin('9999');
    verifyPin('9999');
    expect(verifyPin('4821').ok).toBe(true);
    for (let i = 0; i < 4; i += 1) {
      const attempt = verifyPin('9999');
      expect(attempt.lockedForSeconds).toBeUndefined();
    }
  });

  it('treats a malformed stored hash as a failed match', () => {
    setSecret('pin-hash', 'garbage-without-a-colon');
    expect(verifyPin('4821').ok).toBe(false);
  });
});

describe('resetPin', () => {
  it('wipes the PIN, every API key, and auth.json, and lists them', () => {
    setPin('4821');
    setSecret('api-key-anthropic', 'sk-test-a');
    setSecret('api-key-xai', 'sk-test-x');
    fs.mkdirSync(path.dirname(authJsonPath()), { recursive: true });
    fs.writeFileSync(authJsonPath(), '{"tokens":"fake"}');

    const wiped = resetPin();

    expect(wiped).toContain('pin-hash');
    expect(wiped).toContain('api-key-anthropic');
    expect(wiped).toContain('api-key-xai');
    expect(wiped).toContain('auth.json');
    expect(wiped).not.toContain('api-key-openai-api');
    expect(hasPin()).toBe(false);
    expect(getSecret('api-key-anthropic')).toBeNull();
    expect(fs.existsSync(authJsonPath())).toBe(false);
  });

  it('returns an empty list when there was nothing to wipe', () => {
    expect(resetPin()).toEqual([]);
  });

  it('clears an active lockout so a new PIN starts clean', () => {
    setPin('4821');
    for (let i = 0; i < 5; i += 1) {
      verifyPin('9999');
    }
    resetPin();
    setPin('5555');
    expect(verifyPin('5555')).toEqual({ ok: true });
  });
});

describe('setup marker', () => {
  it('round-trips through the keychain', () => {
    expect(isSetupComplete()).toBe(false);
    markSetupComplete();
    expect(isSetupComplete()).toBe(true);
    expect(getSecret('setup-marker')).not.toBeNull();
  });
});
