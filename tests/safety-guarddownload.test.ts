import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ensureGuardFetch,
  guardFetchState,
  guardProgressBar,
  resetGuardFetchForTests,
} from '../src/safety/guarddownload.js';
import { GUARD_MODEL, guardModelPath, type GuardArtifact } from '../src/safety/modelstore.js';

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-guarddownload-'));
  for (const key of ['TERMI_HOME', 'TERMI_KEYRING']) {
    savedEnv[key] = process.env[key];
  }
  process.env.TERMI_HOME = path.join(tmpRoot, 'home');
  process.env.TERMI_KEYRING = 'file';
  resetGuardFetchForTests();
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
  resetGuardFetchForTests();
});

function artifactFor(payload: Buffer): GuardArtifact {
  return {
    fileName: GUARD_MODEL.fileName,
    url: 'https://example.invalid/guard.gguf',
    bytes: payload.length,
    sha256: crypto.createHash('sha256').update(payload).digest('hex'),
  };
}

describe('ensureGuardFetch', () => {
  it('downloads in the background and reports ready', async () => {
    const payload = Buffer.from('background payload');
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(new Blob([payload]), { status: 200 });
    };
    const promise = ensureGuardFetch({ artifact: artifactFor(payload), fetchImpl });
    expect(guardFetchState().status).toBe('downloading');
    await expect(promise).resolves.toBe(true);
    expect(calls).toBe(1);
    expect(fs.existsSync(guardModelPath())).toBe(true);
  });

  it('is single flight: a second call joins the first', async () => {
    const payload = Buffer.from('single flight');
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      await gate;
      return new Response(new Blob([payload]), { status: 200 });
    };
    const artifact = artifactFor(payload);
    const first = ensureGuardFetch({ artifact, fetchImpl });
    const second = ensureGuardFetch({ artifact, fetchImpl });
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(calls).toBe(1);
  });

  it('reports failed on a broken transfer and allows a retry', async () => {
    const payload = Buffer.from('will fail');
    const artifact = { ...artifactFor(payload), sha256: 'f'.repeat(64) };
    const fetchImpl: typeof fetch = async () =>
      new Response(new Blob([payload]), { status: 200 });
    await expect(ensureGuardFetch({ artifact, fetchImpl })).resolves.toBe(false);
    expect(guardFetchState().status).toBe('failed');
    const good = artifactFor(payload);
    await expect(ensureGuardFetch({ artifact: good, fetchImpl })).resolves.toBe(true);
    expect(guardFetchState().status).toBe('ready');
  });

  it('short-circuits to ready when the file already exists', async () => {
    fs.mkdirSync(path.dirname(guardModelPath()), { recursive: true });
    const fd = fs.openSync(guardModelPath(), 'w');
    fs.ftruncateSync(fd, GUARD_MODEL.bytes);
    fs.closeSync(fd);
    await expect(ensureGuardFetch()).resolves.toBe(true);
    expect(guardFetchState().status).toBe('ready');
  });
});

describe('guardProgressBar', () => {
  it('renders an empty, half, and full bar', () => {
    expect(guardProgressBar({ status: 'downloading', written: 0, total: 100 })).toBe(
      `[__________] 0% of ${GUARD_MODEL.displaySize}`,
    );
    expect(guardProgressBar({ status: 'downloading', written: 50, total: 100 })).toBe(
      `[#####_____] 50% of ${GUARD_MODEL.displaySize}`,
    );
    expect(guardProgressBar({ status: 'ready', written: 100, total: 100 })).toBe(
      `[##########] 100% of ${GUARD_MODEL.displaySize}`,
    );
  });

  it('never overflows on odd totals', () => {
    expect(guardProgressBar({ status: 'downloading', written: 500, total: 100 })).toContain('100%');
    expect(guardProgressBar({ status: 'idle', written: 0, total: 0 })).toContain('0%');
  });
});
