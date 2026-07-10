import { describe, expect, it } from 'vitest';
import { isNewerVersion, parseSemver, readLocalVersion } from '../src/update/version.js';
import { checkForUpdate } from '../src/update/check.js';

describe('parseSemver / isNewerVersion', () => {
  it('parses plain and v-prefixed versions', () => {
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
    expect(parseSemver('v0.1.1')).toEqual([0, 1, 1]);
    expect(parseSemver('2.0')).toEqual([2, 0, 0]);
  });

  it('detects newer versions', () => {
    expect(isNewerVersion('0.1.2', '0.1.1')).toBe(true);
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.1.1', '0.1.1')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.1.1')).toBe(false);
  });
});

describe('readLocalVersion', () => {
  it('reads a non-empty version from package.json', () => {
    const v = readLocalVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('checkForUpdate', () => {
  it('reports an update when the registry is ahead', async () => {
    const result = await checkForUpdate({
      force: true,
      fetchImpl: async () =>
        new Response(JSON.stringify({ version: '99.0.0' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    expect(result.skipped).toBe(false);
    expect(result.latest).toBe('99.0.0');
    expect(result.updateAvailable).toBe(true);
  });

  it('fails open when the registry is down', async () => {
    const result = await checkForUpdate({
      force: true,
      fetchImpl: async () => {
        throw new Error('network down');
      },
    });
    expect(result.skipped).toBe(true);
    expect(result.updateAvailable).toBe(false);
    expect(result.latest).toBeNull();
  });

  it('reports no update when already current', async () => {
    const current = readLocalVersion();
    const result = await checkForUpdate({
      force: true,
      fetchImpl: async () =>
        new Response(JSON.stringify({ version: current }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    expect(result.updateAvailable).toBe(false);
    expect(result.latest).toBe(current);
  });
});
