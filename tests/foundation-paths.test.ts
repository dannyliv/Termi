import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  atomicWriteFileSync,
  auditLogPath,
  authJsonPath,
  ensureDirs,
  errorLogPath,
  locksDir,
  previewBasePort,
  projectsDir,
  settingsPath,
  snapshotsDir,
  termiHome,
} from '../src/config/paths.js';

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-paths-'));
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

describe('paths', () => {
  it('respects TERMI_HOME and TERMI_PROJECTS_DIR overrides', () => {
    expect(termiHome()).toBe(path.join(tmpRoot, 'home'));
    expect(projectsDir()).toBe(path.join(tmpRoot, 'projects'));
  });

  it('derives every state path from TERMI_HOME', () => {
    const home = termiHome();
    expect(settingsPath()).toBe(path.join(home, 'settings.json'));
    expect(authJsonPath()).toBe(path.join(home, 'auth.json'));
    expect(auditLogPath()).toBe(path.join(home, 'audit.log'));
    expect(errorLogPath()).toBe(path.join(home, 'error.log'));
    expect(snapshotsDir()).toBe(path.join(home, 'snapshots'));
    expect(locksDir()).toBe(path.join(home, 'locks'));
  });

  it('falls back to home-directory defaults without overrides', () => {
    delete process.env.TERMI_HOME;
    delete process.env.TERMI_PROJECTS_DIR;
    expect(termiHome()).toBe(path.join(os.homedir(), '.termi'));
    expect(projectsDir()).toBe(path.join(os.homedir(), 'Termi'));
  });

  it('exposes the preview base port', () => {
    expect(previewBasePort).toBe(4311);
  });

  it('ensureDirs creates the full directory set', () => {
    ensureDirs();
    for (const dir of [termiHome(), projectsDir(), snapshotsDir(), locksDir()]) {
      expect(fs.statSync(dir).isDirectory()).toBe(true);
    }
  });

  it('atomicWriteFileSync writes content and leaves no temp files', () => {
    const target = path.join(termiHome(), 'sample.json');
    atomicWriteFileSync(target, '{"a":1}');
    atomicWriteFileSync(target, '{"a":2}');
    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":2}');
    const leftovers = fs.readdirSync(termiHome()).filter((name) => name.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
    if (process.platform !== 'win32') {
      const mode = fs.statSync(target).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });
});
