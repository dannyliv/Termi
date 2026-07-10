/**
 * On-disk store for the local safety-classifier model.
 *
 * One pinned artifact: repo, file, byte size, and sha256 are constants.
 * Downloads stream to a temp file in the models directory, the digest is
 * computed while writing, and only a byte-for-byte verified file is
 * renamed into place. A partial or tampered download can never be loaded
 * because readiness checks the exact size and load happens only after the
 * atomic rename.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { modelsDir } from '../config/paths.js';

/** The pinned classifier artifact. Update size and digest together. */
export const GUARD_MODEL = {
  /** Friendly name shown to parents. */
  name: 'Qwen3Guard 0.6B safety checker',
  fileName: 'Qwen3Guard-Gen-0.6B.Q6_K.gguf',
  url:
    'https://huggingface.co/QuantFactory/Qwen3Guard-Gen-0.6B-GGUF/resolve/main/' +
    'Qwen3Guard-Gen-0.6B.Q6_K.gguf',
  bytes: 622733312,
  sha256: '33a70125c0fff6805e1a1b8b99f59981c6cd3f724a06bf3a99c16dfa8326e585',
  displaySize: '623 MB',
} as const;

export function guardModelPath(): string {
  return path.join(modelsDir(), GUARD_MODEL.fileName);
}

/** True when the model file exists with exactly the pinned size. */
export function guardModelReady(): boolean {
  try {
    return fs.statSync(guardModelPath()).size === GUARD_MODEL.bytes;
  } catch {
    return false;
  }
}

export function removeGuardModel(): void {
  fs.rmSync(guardModelPath(), { force: true });
}

export interface GuardArtifact {
  fileName: string;
  url: string;
  bytes: number;
  sha256: string;
}

export interface DownloadGuardOptions {
  fetchImpl?: typeof fetch;
  /** Called with bytes written so far and the pinned total. */
  onProgress?: (written: number, total: number) => void;
  /** Override the pinned artifact (tests only). */
  artifact?: GuardArtifact;
}

/** Where an in-progress download accumulates. Stable name enables resume. */
export function guardPartialPath(artifact: GuardArtifact = GUARD_MODEL): string {
  return `${path.join(modelsDir(), artifact.fileName)}.partial`;
}

/** Streams a whole file through sha256. The disk contents are the truth. */
export async function sha256OfFile(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk as Buffer));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return hash.digest('hex');
}

/**
 * Downloads and verifies the model, resuming a previous partial download
 * when the server supports byte ranges. Verification happens against the
 * file ON DISK after the transfer, immediately before the rename, so bytes
 * written by anything else (a concurrent Termi process racing the same
 * partial path) can never slip an unverified file into place.
 *
 * Failure behavior, by cause:
 * - interrupted transfer: the partial file stays for the next resume.
 * - digest or oversize problem: the partial is poisoned and deleted.
 * Only a byte-for-byte verified file is renamed into place.
 */
export async function downloadGuardModel(opts: DownloadGuardOptions = {}): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const artifact = opts.artifact ?? GUARD_MODEL;
  const finalPath = path.join(modelsDir(), artifact.fileName);
  const partialPath = guardPartialPath(artifact);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });

  let offset = 0;
  try {
    const size = fs.statSync(partialPath).size;
    if (size > 0 && size < artifact.bytes) {
      offset = size;
    } else if (size >= artifact.bytes) {
      // A partial at or past the full size can never verify; start over.
      fs.rmSync(partialPath, { force: true });
    }
  } catch {
    // No partial: fresh download.
  }

  const res = await fetchImpl(
    artifact.url,
    offset > 0 ? { headers: { range: `bytes=${offset}-` } } : undefined,
  );
  if (!res.ok || res.body === null) {
    throw new Error(`guard-download-failed:http-${res.status}`);
  }
  if (res.status !== 206) {
    // The server sent the whole file (or ignored the range): restart clean.
    offset = 0;
  }

  let written = offset;
  try {
    const source = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
    source.on('data', (chunk: Buffer) => {
      written += chunk.length;
      opts.onProgress?.(written, artifact.bytes);
    });
    await pipeline(
      source,
      fs.createWriteStream(partialPath, { mode: 0o600, flags: offset > 0 ? 'a' : 'w' }),
    );
  } catch (err) {
    // Transfer error: keep the partial so the next attempt resumes.
    throw err instanceof Error ? err : new Error(String(err));
  }

  // Judge the file as it exists on disk, not the bytes this process saw.
  const diskSize = fs.statSync(partialPath).size;
  if (diskSize < artifact.bytes) {
    // Short. Keep the partial; the next attempt resumes.
    throw new Error('guard-download-failed:interrupted');
  }
  if (diskSize > artifact.bytes) {
    fs.rmSync(partialPath, { force: true });
    throw new Error('guard-download-failed:size-mismatch');
  }
  const digest = await sha256OfFile(partialPath);
  if (digest !== artifact.sha256) {
    fs.rmSync(partialPath, { force: true });
    throw new Error('guard-download-failed:digest-mismatch');
  }
  fs.renameSync(partialPath, finalPath);
}
