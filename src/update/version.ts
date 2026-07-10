/**
 * Local version helpers and semver compare for the update checker.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** npm package name. The CLI bin is still `termi`. */
export const NPM_PACKAGE = 'termi-kids';

/** Reads the version embedded next to the built dist (package.json). */
export function readLocalVersion(): string {
  try {
    // dist/update/version.js -> package.json at package root
    const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Parse a simple x.y.z (or vX.Y.Z) version; non-numeric parts become 0. */
export function parseSemver(version: string): [number, number, number] {
  const cleaned = version.trim().replace(/^v/i, '');
  const parts = cleaned.split(/[.+-]/).slice(0, 3).map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** True when latest is strictly newer than current. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return false;
}
