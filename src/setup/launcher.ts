/**
 * Day-2 launcher: a double-clickable "Termi" file on the Desktop so a kid
 * can get back in without typing a command. One file per platform:
 * macOS Termi.command, Windows Termi.bat, Linux Termi.desktop.
 * Everything is best effort and silent on failure.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface LauncherFile {
  fileName: string;
  content: string;
  /** POSIX mode. Best effort on Windows. */
  mode: number;
}

/** The launcher file contents for a platform string (process.platform). */
export function launcherFileFor(platform: string): LauncherFile {
  if (platform === 'darwin') {
    return {
      fileName: 'Termi.command',
      content: '#!/bin/zsh\nexec termi\n',
      mode: 0o755,
    };
  }
  if (platform === 'win32') {
    return {
      fileName: 'Termi.bat',
      content: '@echo off\r\ntermi\r\n',
      mode: 0o644,
    };
  }
  return {
    fileName: 'Termi.desktop',
    content: [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Termi',
      'Comment=Build games with your robot buddy',
      'Exec=termi',
      'Terminal=true',
      '',
    ].join('\n'),
    mode: 0o755,
  };
}

export interface WriteLauncherOptions {
  /** Injectable for tests. Defaults to process.platform. */
  platform?: string;
  /** Injectable for tests. Defaults to <home>/Desktop. */
  desktopDir?: string;
}

export interface WrittenLauncher {
  path: string;
  fileName: string;
  content: string;
}

/**
 * Writes the launcher onto the Desktop. Returns what it wrote, or null when
 * there is no Desktop directory or the write failed. Never throws.
 */
export function writeLauncher(opts: WriteLauncherOptions = {}): WrittenLauncher | null {
  const platform = opts.platform ?? process.platform;
  const desktopDir = opts.desktopDir ?? path.join(os.homedir(), 'Desktop');
  try {
    if (!fs.existsSync(desktopDir) || !fs.statSync(desktopDir).isDirectory()) {
      return null;
    }
    const file = launcherFileFor(platform);
    const fullPath = path.join(desktopDir, file.fileName);
    fs.writeFileSync(fullPath, file.content, { mode: file.mode });
    try {
      fs.chmodSync(fullPath, file.mode);
    } catch {
      // chmod is best effort, mostly a no-op on Windows.
    }
    return { path: fullPath, fileName: file.fileName, content: file.content };
  } catch {
    return null;
  }
}
