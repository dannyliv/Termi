/**
 * Central path helpers for Termi state on disk.
 *
 * Everything is computed lazily (functions, not top-level constants) so the
 * TERMI_HOME and TERMI_PROJECTS_DIR environment overrides work at any point,
 * which is what the test suite relies on.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** First port the preview server tries; it scans upward from here. */
export const previewBasePort = 4311;

/** Root for Termi's own state. Default: <home>/.termi. Override: TERMI_HOME. */
export function termiHome(): string {
  const override = process.env.TERMI_HOME;
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), '.termi');
}

/** Where kid projects live. Default: <home>/Termi. Override: TERMI_PROJECTS_DIR. */
export function projectsDir(): string {
  const override = process.env.TERMI_PROJECTS_DIR;
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), 'Termi');
}

/** Signed settings envelope (settings plus MAC). */
export function settingsPath(): string {
  return path.join(termiHome(), 'settings.json');
}

/** OAuth token store. Kept on disk, not in the keychain, due to blob size caps. */
export function authJsonPath(): string {
  return path.join(termiHome(), 'auth.json');
}

/** Forward hash chained audit log. */
export function auditLogPath(): string {
  return path.join(termiHome(), 'audit.log');
}

/** Crash details land here; the kid only ever sees a friendly screen. */
export function errorLogPath(): string {
  return path.join(termiHome(), 'error.log');
}

/** Content-addressed snapshot blobs and per-turn manifests. */
export function snapshotsDir(): string {
  return path.join(termiHome(), 'snapshots');
}

/** Cross-process lock files (for example the token refresh lock). */
export function locksDir(): string {
  return path.join(termiHome(), 'locks');
}

/** Local safety-model files (the on-device classifier). */
export function modelsDir(): string {
  return path.join(termiHome(), 'models');
}

/** Creates every directory Termi needs. Safe to call repeatedly. */
export function ensureDirs(): void {
  for (const dir of [termiHome(), projectsDir(), snapshotsDir(), locksDir(), modelsDir()]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Writes a file atomically: temp file in the same directory, then rename.
 * Mode defaults to 0o600 (owner only). Mode is best effort on Windows.
 */
export function atomicWriteFileSync(filePath: string, data: string, mode = 0o600): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpName = `.${path.basename(filePath)}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const tmpPath = path.join(dir, tmpName);
  fs.writeFileSync(tmpPath, data, { mode });
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // Best effort cleanup; the original error matters more.
    }
    throw err;
  }
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // Best effort: chmod is mostly a no-op on Windows.
  }
}
