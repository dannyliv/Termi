/**
 * Content-addressed snapshots for undo and redo.
 *
 * Layout under snapshotsDir()/<slug>/:
 * - blobs/<sha256>       file contents, one blob per unique content
 * - manifests/<n>.json   { n, ts, files: { relPath: sha } } per saved state
 * - state.json           { pointer } = the manifest that matches disk now
 *
 * Only kid files are snapshotted. TERMI.md, .termi.json, dotfiles, and
 * vendored engine files are never captured, restored, or deleted.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFileSync, snapshotsDir } from '../config/paths.js';
import type { SnapshotStore } from '../types.js';
import type { ProjectContext } from './store.js';

interface Manifest {
  n: number;
  ts: string;
  files: Record<string, string>;
}

/** How many manifests survive a prune. */
export const keepManifestCount = 50;

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sameFiles(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => a[k] === b[k]);
}

export function createSnapshotStore(project: ProjectContext): SnapshotStore {
  const root = path.join(snapshotsDir(), project.meta.slug);
  const blobsDir = path.join(root, 'blobs');
  const manifestsDir = path.join(root, 'manifests');
  const statePath = path.join(root, 'state.json');

  const manifestPath = (n: number): string => path.join(manifestsDir, `${n}.json`);

  const readPointer = (): number => {
    try {
      const data = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { pointer?: unknown };
      if (typeof data.pointer === 'number' && Number.isInteger(data.pointer) && data.pointer >= 0) {
        return data.pointer;
      }
    } catch {
      // No state yet: pointer starts at zero.
    }
    return 0;
  };

  const writePointer = (n: number): void => {
    atomicWriteFileSync(statePath, JSON.stringify({ pointer: n }) + '\n');
  };

  const listManifestNumbers = (): number[] => {
    let names: string[];
    try {
      names = fs.readdirSync(manifestsDir);
    } catch {
      return [];
    }
    const nums: number[] = [];
    for (const name of names) {
      const match = /^(\d+)\.json$/.exec(name);
      if (match && match[1] !== undefined) nums.push(Number(match[1]));
    }
    nums.sort((a, b) => a - b);
    return nums;
  };

  const readManifest = (n: number): Manifest | null => {
    if (n < 1) return null;
    try {
      const data = JSON.parse(fs.readFileSync(manifestPath(n), 'utf8')) as Manifest;
      if (typeof data.n !== 'number' || typeof data.files !== 'object' || data.files === null) {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  };

  const projectFilePath = (relPath: string): string =>
    path.join(project.dir, ...relPath.split('/'));

  /** Hashes the kid files on disk right now. */
  const captureCurrent = (): { files: Record<string, string>; bySha: Map<string, Buffer> } => {
    const files: Record<string, string> = {};
    const bySha = new Map<string, Buffer>();
    for (const f of project.listKidFiles()) {
      let buf: Buffer;
      try {
        buf = fs.readFileSync(projectFilePath(f.relPath));
      } catch {
        continue;
      }
      const sha = sha256(buf);
      files[f.relPath] = sha;
      bySha.set(sha, buf);
    }
    return { files, bySha };
  };

  /**
   * Saves the current state as manifest pointer+1.
   * Any redo manifests above the pointer are dropped first.
   */
  const persistCurrent = (
    current: { files: Record<string, string>; bySha: Map<string, Buffer> },
    pointer: number,
  ): number => {
    for (const n of listManifestNumbers()) {
      if (n > pointer) fs.rmSync(manifestPath(n), { force: true });
    }
    fs.mkdirSync(blobsDir, { recursive: true });
    fs.mkdirSync(manifestsDir, { recursive: true });
    for (const [sha, buf] of current.bySha) {
      const blobPath = path.join(blobsDir, sha);
      if (!fs.existsSync(blobPath)) fs.writeFileSync(blobPath, buf);
    }
    const next = pointer + 1;
    const manifest: Manifest = { n: next, ts: new Date().toISOString(), files: current.files };
    atomicWriteFileSync(manifestPath(next), JSON.stringify(manifest) + '\n');
    writePointer(next);
    return next;
  };

  /** Makes sure the disk state is captured. Returns the pointer after. */
  const ensureSnapshotted = (): number => {
    const pointer = readPointer();
    const current = captureCurrent();
    const last = readManifest(pointer);
    if (last !== null && sameFiles(last.files, current.files)) return pointer;
    return persistCurrent(current, pointer);
  };

  /** Writes a manifest's files back to disk and removes kid files not in it. */
  const restore = (manifest: Manifest): boolean => {
    for (const sha of Object.values(manifest.files)) {
      if (!fs.existsSync(path.join(blobsDir, sha))) return false;
    }
    for (const f of project.listKidFiles()) {
      if (!(f.relPath in manifest.files)) {
        fs.rmSync(projectFilePath(f.relPath), { force: true });
      }
    }
    for (const [relPath, sha] of Object.entries(manifest.files)) {
      const blob = fs.readFileSync(path.join(blobsDir, sha));
      const dest = projectFilePath(relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, blob);
    }
    return true;
  };

  /** Keeps the newest manifests and drops blobs nothing points at. */
  const prune = (): void => {
    const nums = listManifestNumbers();
    if (nums.length > keepManifestCount) {
      for (const n of nums.slice(0, nums.length - keepManifestCount)) {
        fs.rmSync(manifestPath(n), { force: true });
      }
    }
    const referenced = new Set<string>();
    for (const n of listManifestNumbers()) {
      const manifest = readManifest(n);
      if (manifest === null) continue;
      for (const sha of Object.values(manifest.files)) referenced.add(sha);
    }
    let blobNames: string[];
    try {
      blobNames = fs.readdirSync(blobsDir);
    } catch {
      return;
    }
    for (const name of blobNames) {
      if (!referenced.has(name)) fs.rmSync(path.join(blobsDir, name), { force: true });
    }
  };

  return {
    beginTurn(): void {
      ensureSnapshotted();
      prune();
    },

    undo(): boolean {
      const pointer = ensureSnapshotted();
      const target = readManifest(pointer - 1);
      if (target === null) return false;
      if (!restore(target)) return false;
      writePointer(pointer - 1);
      return true;
    },

    redo(): boolean {
      const pointer = readPointer();
      const target = readManifest(pointer + 1);
      if (target === null) return false;
      if (!restore(target)) return false;
      writePointer(pointer + 1);
      return true;
    },
  };
}
