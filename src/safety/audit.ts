/**
 * Tamper-evident audit log: JSONL with a forward HMAC chain.
 *
 * Each line is {...event, prevMac, mac} where
 * mac = HMAC-SHA256(key, prevMac + canonicalJson(event)).
 * The key is the shared "hmac-key" keychain secret (created on first use).
 * Appends are single appendFileSync lines, so concurrent writers interleave
 * whole entries. Rotation at 5 MB renames to audit.log.1 and starts the new
 * file with an anchor line that carries the old file's last mac.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import { getSecret, setSecret } from '../auth/keychain.js';
import { auditLogPath, ensureDirs } from '../config/paths.js';
import type { AuditEvent } from '../types.js';

export const AUDIT_MAX_BYTES = 5 * 1024 * 1024;
const GENESIS = 'genesis';
const HMAC_ACCOUNT = 'hmac-key';

/** Where the rotated previous log lands. */
export function rotatedAuditLogPath(): string {
  return `${auditLogPath()}.1`;
}

/** Loads (or creates once) the shared HMAC key. */
function hmacKey(): Buffer {
  let hex = getSecret(HMAC_ACCOUNT);
  if (!hex) {
    hex = crypto.randomBytes(32).toString('hex');
    setSecret(HMAC_ACCOUNT, hex);
  }
  return Buffer.from(hex, 'hex');
}

/** JSON with recursively sorted keys, so the MAC input is stable. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function computeMac(key: Buffer, prevMac: string, entryCanonical: string): string {
  return crypto.createHmac('sha256', key).update(prevMac).update(entryCanonical).digest('hex');
}

interface ChainLine {
  prevMac: string;
  mac: string;
  [key: string]: unknown;
}

/** Reads the mac of the last line, or null for a fresh chain. */
function lastMac(file: string): string | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const last = lines[lines.length - 1];
  if (!last) {
    return null;
  }
  try {
    const parsed = JSON.parse(last) as ChainLine;
    return typeof parsed.mac === 'string' ? parsed.mac : null;
  } catch {
    return null;
  }
}

/** Strips chain fields so the original entry can be re-canonicalized. */
function entryWithoutChain(line: ChainLine): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...line };
  delete copy['prevMac'];
  delete copy['mac'];
  return copy;
}

function appendLine(file: string, entry: Record<string, unknown>, prevMac: string, key: Buffer): string {
  const mac = computeMac(key, prevMac, canonicalJson(entry));
  const full = { ...entry, prevMac, mac };
  fs.appendFileSync(file, `${JSON.stringify(full)}\n`, { mode: 0o600 });
  return mac;
}

/**
 * Rotates when the file passed maxBytes: rename to audit.log.1 and start the
 * new file with an anchor entry carrying the rotated file's last mac.
 */
function maybeRotate(file: string, key: Buffer, maxBytes: number): void {
  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    return;
  }
  if (size <= maxBytes) {
    return;
  }
  const carried = lastMac(file) ?? GENESIS;
  fs.rmSync(rotatedAuditLogPath(), { force: true });
  fs.renameSync(file, rotatedAuditLogPath());
  const anchor: Record<string, unknown> = {
    ts: new Date().toISOString(),
    layer: 'system',
    anchor: true,
    rotatedFrom: 'audit.log.1',
  };
  // The anchor chains off the rotated file's last mac, preserving continuity.
  appendLine(file, anchor, carried, key);
}

/** Appends one audit event to the chained log. */
export function appendAudit(event: AuditEvent, opts?: { maxBytes?: number }): void {
  ensureDirs();
  const file = auditLogPath();
  const key = hmacKey();
  maybeRotate(file, key, opts?.maxBytes ?? AUDIT_MAX_BYTES);
  const prevMac = lastMac(file) ?? GENESIS;
  appendLine(file, { ...event }, prevMac, key);
}

export interface ChainVerification {
  ok: boolean;
  /** Number of well-formed entries seen (including a leading anchor). */
  entries: number;
  /** 1-based line number of the first bad line, or null when ok. */
  firstBadLine: number | null;
}

/**
 * Walks the audit log and verifies the HMAC chain. A leading anchor line may
 * carry a prevMac from a rotated file; its own mac must still verify.
 */
export function verifyAuditChain(file = auditLogPath()): ChainVerification {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return { ok: true, entries: 0, firstBadLine: null };
  }
  const key = hmacKey();
  const lines = raw.split('\n');
  let expectedPrev: string | null = null; // null until the first line fixes it
  let entries = 0;
  let lineNo = 0;
  for (const line of lines) {
    lineNo++;
    if (!line.trim()) {
      continue;
    }
    let parsed: ChainLine;
    try {
      parsed = JSON.parse(line) as ChainLine;
    } catch {
      return { ok: false, entries, firstBadLine: lineNo };
    }
    if (typeof parsed.mac !== 'string' || typeof parsed.prevMac !== 'string') {
      return { ok: false, entries, firstBadLine: lineNo };
    }
    if (expectedPrev !== null && parsed.prevMac !== expectedPrev) {
      return { ok: false, entries, firstBadLine: lineNo };
    }
    if (expectedPrev === null && !(parsed.prevMac === GENESIS || parsed['anchor'] === true)) {
      return { ok: false, entries, firstBadLine: lineNo };
    }
    const recomputed = computeMac(key, parsed.prevMac, canonicalJson(entryWithoutChain(parsed)));
    if (recomputed !== parsed.mac) {
      return { ok: false, entries, firstBadLine: lineNo };
    }
    expectedPrev = parsed.mac;
    entries++;
  }
  return { ok: true, entries, firstBadLine: null };
}
