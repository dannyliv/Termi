/**
 * Installs the latest termi-kids from npm into the global prefix.
 */

import { spawn } from 'node:child_process';
import { NPM_PACKAGE } from './version.js';

export interface InstallUpdateResult {
  ok: boolean;
  code: number | null;
  detail: string;
}

export interface InstallUpdateOptions {
  /** Override the spawn implementation (tests). */
  spawnImpl?: typeof spawn;
  /** Extra env for the child process. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Runs `npm install -g termi-kids@latest` and waits for exit.
 * Streams npm output to the parent so parents can see progress.
 */
export function installLatestUpdate(opts: InstallUpdateOptions = {}): Promise<InstallUpdateResult> {
  const spawnImpl = opts.spawnImpl ?? spawn;
  return new Promise((resolve) => {
    const child = spawnImpl(
      'npm',
      ['install', '-g', `${NPM_PACKAGE}@latest`],
      {
        stdio: 'inherit',
        env: opts.env ?? process.env,
        shell: process.platform === 'win32',
      },
    );
    child.on('error', (err) => {
      resolve({ ok: false, code: null, detail: err.message });
    });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code,
        detail: code === 0 ? 'updated' : `npm exited with code ${code ?? 'unknown'}`,
      });
    });
  });
}
