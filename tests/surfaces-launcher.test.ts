import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { launcherFileFor, writeLauncher } from '../src/setup/launcher.js';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-launcher-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('launcherFileFor', () => {
  it('builds a zsh .command file for macOS', () => {
    const file = launcherFileFor('darwin');
    expect(file.fileName).toBe('Termi.command');
    expect(file.content).toContain('#!/bin/zsh');
    expect(file.content).toContain('exec termi');
    expect(file.mode).toBe(0o755);
  });

  it('builds a .bat file for Windows', () => {
    const file = launcherFileFor('win32');
    expect(file.fileName).toBe('Termi.bat');
    expect(file.content).toContain('@echo off');
    expect(file.content).toContain('termi');
  });

  it('builds a .desktop entry for Linux', () => {
    const file = launcherFileFor('linux');
    expect(file.fileName).toBe('Termi.desktop');
    expect(file.content).toContain('[Desktop Entry]');
    expect(file.content).toContain('Type=Application');
    expect(file.content).toContain('Exec=termi');
    expect(file.content).toContain('Terminal=true');
    expect(file.content).toContain('Name=Termi');
    expect(file.mode).toBe(0o755);
  });
});

describe('writeLauncher', () => {
  it('writes the file onto the given desktop directory', () => {
    const desktopDir = path.join(tmpRoot, 'Desktop');
    fs.mkdirSync(desktopDir);
    const written = writeLauncher({ platform: 'darwin', desktopDir });
    expect(written).not.toBeNull();
    expect(written?.path).toBe(path.join(desktopDir, 'Termi.command'));
    const onDisk = fs.readFileSync(written!.path, 'utf8');
    expect(onDisk).toBe(written!.content);
    if (process.platform !== 'win32') {
      const mode = fs.statSync(written!.path).mode & 0o777;
      expect(mode).toBe(0o755);
    }
  });

  it('writes per-platform contents', () => {
    const desktopDir = path.join(tmpRoot, 'Desktop');
    fs.mkdirSync(desktopDir);
    const bat = writeLauncher({ platform: 'win32', desktopDir });
    expect(bat?.fileName).toBe('Termi.bat');
    const desktop = writeLauncher({ platform: 'linux', desktopDir });
    expect(desktop?.fileName).toBe('Termi.desktop');
    expect(fs.readFileSync(desktop!.path, 'utf8')).toContain('Exec=termi');
  });

  it('skips silently when there is no Desktop directory', () => {
    const missing = path.join(tmpRoot, 'NoDesktopHere');
    expect(writeLauncher({ platform: 'darwin', desktopDir: missing })).toBeNull();
  });

  it('skips silently when the desktop path is a file', () => {
    const fakeDir = path.join(tmpRoot, 'Desktop');
    fs.writeFileSync(fakeDir, 'not a directory');
    expect(writeLauncher({ platform: 'linux', desktopDir: fakeDir })).toBeNull();
  });
});
