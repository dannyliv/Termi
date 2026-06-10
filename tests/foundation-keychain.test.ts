import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  API_KEY_ACCOUNTS,
  deleteSecret,
  getSecret,
  isFallbackActive,
  KEYCHAIN_SERVICE,
  setSecret,
} from '../src/auth/keychain.js';

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-keychain-'));
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

describe('keychain file fallback', () => {
  it('reports the fallback as active under TERMI_KEYRING=file', () => {
    expect(isFallbackActive()).toBe(true);
  });

  it('uses the expected service name', () => {
    expect(KEYCHAIN_SERVICE).toBe('termi-cli');
  });

  it('round-trips a secret', () => {
    setSecret('pin-hash', 'abc123:def456');
    expect(getSecret('pin-hash')).toBe('abc123:def456');
  });

  it('overwrites an existing secret', () => {
    setSecret('install-id', 'first');
    setSecret('install-id', 'second');
    expect(getSecret('install-id')).toBe('second');
  });

  it('returns null for a missing account', () => {
    expect(getSecret('never-set')).toBeNull();
  });

  it('deletes secrets and reports whether anything was removed', () => {
    setSecret('hmac-key', 'aa'.repeat(32));
    expect(deleteSecret('hmac-key')).toBe(true);
    expect(getSecret('hmac-key')).toBeNull();
    expect(deleteSecret('hmac-key')).toBe(false);
  });

  it('writes secrets.json inside TERMI_HOME with owner-only mode', () => {
    setSecret('setup-marker', '2026-06-10T00:00:00.000Z');
    const file = path.join(process.env.TERMI_HOME as string, 'secrets.json');
    expect(fs.existsSync(file)).toBe(true);
    if (process.platform !== 'win32') {
      const mode = fs.statSync(file).mode & 0o777;
      expect(mode).toBe(0o600);
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
    expect(parsed['setup-marker']).toBe('2026-06-10T00:00:00.000Z');
  });

  it('keeps independent accounts independent', () => {
    for (const account of API_KEY_ACCOUNTS) {
      setSecret(account, `key-for-${account}`);
    }
    expect(getSecret('api-key-anthropic')).toBe('key-for-api-key-anthropic');
    deleteSecret('api-key-anthropic');
    expect(getSecret('api-key-openai-api')).toBe('key-for-api-key-openai-api');
    expect(getSecret('api-key-xai')).toBe('key-for-api-key-xai');
    expect(getSecret('api-key-anthropic')).toBeNull();
  });

  it('survives a corrupted secrets.json by treating it as empty', () => {
    const home = process.env.TERMI_HOME as string;
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'secrets.json'), 'not json at all');
    expect(getSecret('pin-hash')).toBeNull();
    setSecret('pin-hash', 'fresh');
    expect(getSecret('pin-hash')).toBe('fresh');
  });
});
