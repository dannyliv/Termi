import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { modelsDir } from '../src/config/paths.js';
import {
  downloadGuardModel,
  GUARD_MODEL,
  guardModelPath,
  guardModelReady,
  guardPartialPath,
  removeGuardModel,
  type GuardArtifact,
} from '../src/safety/modelstore.js';

let tmpRoot: string;
let savedHome: string | undefined;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-modelstore-'));
  savedHome = process.env.TERMI_HOME;
  process.env.TERMI_HOME = path.join(tmpRoot, 'home');
});

afterEach(() => {
  if (savedHome === undefined) {
    delete process.env.TERMI_HOME;
  } else {
    process.env.TERMI_HOME = savedHome;
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** Creates a sparse file with exactly the given size (no real bytes). */
function sparseFile(filePath: string, bytes: number): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const fd = fs.openSync(filePath, 'w');
  fs.ftruncateSync(fd, bytes);
  fs.closeSync(fd);
}

function artifactFor(payload: Buffer): GuardArtifact {
  return {
    fileName: GUARD_MODEL.fileName,
    url: 'https://example.invalid/guard.gguf',
    bytes: payload.length,
    sha256: crypto.createHash('sha256').update(payload).digest('hex'),
  };
}

function fetchReturning(payload: Buffer, status = 200): typeof fetch {
  return async () => new Response(status === 200 ? new Blob([payload]) : null, { status });
}

describe('guard model store', () => {
  it('keeps the model under the models directory', () => {
    expect(guardModelPath()).toBe(path.join(modelsDir(), GUARD_MODEL.fileName));
  });

  it('is not ready when the file is missing or the wrong size', () => {
    expect(guardModelReady()).toBe(false);
    sparseFile(guardModelPath(), 12);
    expect(guardModelReady()).toBe(false);
  });

  it('is ready when the file has exactly the pinned size', () => {
    sparseFile(guardModelPath(), GUARD_MODEL.bytes);
    expect(guardModelReady()).toBe(true);
  });

  it('downloads, verifies, and lands the file atomically', async () => {
    const payload = Buffer.from('tiny fake model payload');
    const seen: number[] = [];
    await downloadGuardModel({
      artifact: artifactFor(payload),
      fetchImpl: fetchReturning(payload),
      onProgress: (written) => seen.push(written),
    });
    expect(fs.readFileSync(guardModelPath())).toEqual(payload);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(payload.length);
  });

  it('rejects a tampered payload and leaves nothing behind', async () => {
    const payload = Buffer.from('tampered payload');
    const artifact = { ...artifactFor(payload), sha256: 'f'.repeat(64) };
    await expect(
      downloadGuardModel({ artifact, fetchImpl: fetchReturning(payload) }),
    ).rejects.toThrow('digest-mismatch');
    expect(fs.existsSync(guardModelPath())).toBe(false);
    expect(fs.readdirSync(modelsDir())).toEqual([]);
  });

  it('keeps the partial after a short read so the next attempt resumes', async () => {
    const payload = Buffer.from('short');
    const artifact = { ...artifactFor(payload), bytes: payload.length + 5 };
    await expect(
      downloadGuardModel({ artifact, fetchImpl: fetchReturning(payload) }),
    ).rejects.toThrow('interrupted');
    expect(fs.existsSync(guardPartialPath(artifact))).toBe(true);
    expect(fs.existsSync(guardModelPath())).toBe(false);
  });

  it('resumes from a partial when the server honors the range', async () => {
    const payload = Buffer.from('0123456789abcdef');
    const artifact = artifactFor(payload);
    const half = payload.length / 2;
    fs.mkdirSync(modelsDir(), { recursive: true });
    fs.writeFileSync(guardPartialPath(artifact), payload.subarray(0, half));
    const ranges: string[] = [];
    const rangeFetch: typeof fetch = async (_url, init) => {
      const range = new Headers(init?.headers).get('range') ?? '';
      ranges.push(range);
      const from = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0);
      return new Response(new Blob([payload.subarray(from)]), { status: 206 });
    };
    const seen: number[] = [];
    await downloadGuardModel({
      artifact,
      fetchImpl: rangeFetch,
      onProgress: (written) => seen.push(written),
    });
    expect(ranges).toEqual([`bytes=${half}-`]);
    expect(fs.readFileSync(guardModelPath())).toEqual(payload);
    expect(seen[0]).toBeGreaterThan(half);
    expect(fs.existsSync(guardPartialPath(artifact))).toBe(false);
  });

  it('starts over cleanly when the server ignores the range', async () => {
    const payload = Buffer.from('full payload again');
    const artifact = artifactFor(payload);
    fs.mkdirSync(modelsDir(), { recursive: true });
    fs.writeFileSync(guardPartialPath(artifact), Buffer.from('stale-different-bytes'));
    await downloadGuardModel({ artifact, fetchImpl: fetchReturning(payload) });
    expect(fs.readFileSync(guardModelPath())).toEqual(payload);
  });

  it('a corrupted partial fails the whole-file digest even when the resume is honest', async () => {
    const payload = Buffer.from('0123456789abcdef');
    const artifact = artifactFor(payload);
    const half = payload.length / 2;
    fs.mkdirSync(modelsDir(), { recursive: true });
    // Wrong bytes on disk (same size a resume expects), honest remainder
    // from the server: only hashing the file as it exists on disk catches it.
    fs.writeFileSync(guardPartialPath(artifact), Buffer.from('XXXXXXXX'));
    const rangeFetch: typeof fetch = async (_url, init) => {
      const range = new Headers(init?.headers).get('range') ?? '';
      const from = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0);
      return new Response(new Blob([payload.subarray(from)]), { status: 206 });
    };
    await expect(downloadGuardModel({ artifact, fetchImpl: rangeFetch })).rejects.toThrow(
      'digest-mismatch',
    );
    expect(fs.existsSync(guardModelPath())).toBe(false);
    expect(fs.existsSync(guardPartialPath(artifact))).toBe(false);
    expect(half).toBe(8);
  });

  it('surfaces HTTP failures', async () => {
    const payload = Buffer.from('x');
    await expect(
      downloadGuardModel({
        artifact: artifactFor(payload),
        fetchImpl: fetchReturning(payload, 503),
      }),
    ).rejects.toThrow('http-503');
  });

  it('removes the model file', () => {
    sparseFile(guardModelPath(), GUARD_MODEL.bytes);
    removeGuardModel();
    expect(guardModelReady()).toBe(false);
    removeGuardModel();
  });
});
