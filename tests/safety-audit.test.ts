import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendAudit, canonicalJson, rotatedAuditLogPath, verifyAuditChain } from '../src/safety/audit.js';
import { auditLogPath } from '../src/config/paths.js';
import type { AuditEvent } from '../src/types.js';

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-audit-'));
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

function event(n: number): AuditEvent {
  return {
    ts: new Date(2026, 5, 10, 12, 0, n).toISOString(),
    layer: 'L2',
    event: 'block',
    category: 'violence',
    severity: 2,
    direction: 'input',
    excerpt: `blocked thing number ${n}`,
  };
}

describe('audit chain', () => {
  it('appends 5 entries and verifies ok', () => {
    for (let i = 0; i < 5; i++) {
      appendAudit(event(i));
    }
    const result = verifyAuditChain();
    expect(result.ok).toBe(true);
    expect(result.entries).toBe(5);
    expect(result.firstBadLine).toBeNull();
  });

  it('chains each entry to the previous mac', () => {
    appendAudit(event(0));
    appendAudit(event(1));
    const lines = fs.readFileSync(auditLogPath(), 'utf8').trim().split('\n');
    const first = JSON.parse(lines[0]!) as { prevMac: string; mac: string };
    const second = JSON.parse(lines[1]!) as { prevMac: string; mac: string };
    expect(first.prevMac).toBe('genesis');
    expect(second.prevMac).toBe(first.mac);
  });

  it('an empty or missing log verifies ok with zero entries', () => {
    const result = verifyAuditChain();
    expect(result.ok).toBe(true);
    expect(result.entries).toBe(0);
  });

  it('detects tampering: edited line 3 reports firstBadLine 3', () => {
    for (let i = 0; i < 5; i++) {
      appendAudit(event(i));
    }
    const file = auditLogPath();
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    const tampered = JSON.parse(lines[2]!) as Record<string, unknown>;
    tampered['excerpt'] = 'history rewritten';
    lines[2] = JSON.stringify(tampered);
    fs.writeFileSync(file, `${lines.join('\n')}\n`);

    const result = verifyAuditChain();
    expect(result.ok).toBe(false);
    expect(result.firstBadLine).toBe(3);
    expect(result.entries).toBe(2);
  });

  it('detects a deleted line as a chain gap', () => {
    for (let i = 0; i < 5; i++) {
      appendAudit(event(i));
    }
    const file = auditLogPath();
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    lines.splice(1, 1); // drop the second entry
    fs.writeFileSync(file, `${lines.join('\n')}\n`);

    const result = verifyAuditChain();
    expect(result.ok).toBe(false);
    expect(result.firstBadLine).toBe(2);
  });

  it('detects garbage lines', () => {
    appendAudit(event(0));
    fs.appendFileSync(auditLogPath(), 'not json at all\n');
    const result = verifyAuditChain();
    expect(result.ok).toBe(false);
    expect(result.firstBadLine).toBe(2);
  });
});

describe('rotation', () => {
  it('rotates past the size cap and preserves the chain via an anchor', () => {
    // Tiny cap so a handful of entries trigger rotation.
    appendAudit(event(0), { maxBytes: 300 });
    appendAudit(event(1), { maxBytes: 300 });
    appendAudit(event(2), { maxBytes: 300 });

    const rotated = rotatedAuditLogPath();
    expect(fs.existsSync(rotated)).toBe(true);

    // The rotated file is a valid chain on its own.
    const oldResult = verifyAuditChain(rotated);
    expect(oldResult.ok).toBe(true);
    expect(oldResult.entries).toBeGreaterThan(0);

    // The new file starts with an anchor carrying the rotated file's last mac.
    const oldLines = fs.readFileSync(rotated, 'utf8').trim().split('\n');
    const lastOld = JSON.parse(oldLines[oldLines.length - 1]!) as { mac: string };
    const newLines = fs.readFileSync(auditLogPath(), 'utf8').trim().split('\n');
    const anchor = JSON.parse(newLines[0]!) as { anchor?: boolean; prevMac: string };
    expect(anchor.anchor).toBe(true);
    expect(anchor.prevMac).toBe(lastOld.mac);

    // And the new file verifies end to end.
    const newResult = verifyAuditChain();
    expect(newResult.ok).toBe(true);
    expect(newResult.entries).toBeGreaterThanOrEqual(2);
  });
});

describe('canonical json', () => {
  it('is stable under key reordering', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('drops undefined values', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});
