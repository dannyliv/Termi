/**
 * Session-start update prompt and the `termi update` command body.
 */

import * as p from '@clack/prompts';
import { style } from '../ui/theme.js';
import { checkForUpdate } from './check.js';
import { installLatestUpdate } from './install.js';
import { NPM_PACKAGE, readLocalVersion } from './version.js';

/** Env flag tests (and power users) use to skip the network check. */
export const SKIP_UPDATE_ENV = 'TERMI_SKIP_UPDATE';

export function shouldSkipUpdateCheck(): boolean {
  if (process.env.VITEST !== undefined || process.env.NODE_ENV === 'test') {
    return true;
  }
  const flag = process.env[SKIP_UPDATE_ENV];
  return flag === '1' || flag === 'true' || flag === 'yes';
}

/**
 * Quiet check used on every normal session start. Asks y/n when a newer
 * version is on npm. Fail-open: errors and skips never interrupt the kid.
 */
export async function maybePromptForUpdate(): Promise<void> {
  if (shouldSkipUpdateCheck()) {
    return;
  }
  let result;
  try {
    result = await checkForUpdate();
  } catch {
    return;
  }
  if (!result.updateAvailable || result.latest === null) {
    return;
  }

  console.log('');
  console.log(
    style.title(`A new Termi is ready: v${result.latest}`) +
      style.dim(` (you have v${result.current})`),
  );
  const answer = await p.confirm({
    message: 'Update Termi now?',
    initialValue: true,
  });
  if (p.isCancel(answer) || answer !== true) {
    console.log(style.dim('Okay. You can run "termi update" later.'));
    console.log('');
    return;
  }
  await runUpdateCommand({ quietCheck: true });
}

/**
 * `termi update`: always checks npm and installs when newer (or forced).
 */
export async function runUpdateCommand(opts: { quietCheck?: boolean } = {}): Promise<void> {
  const current = readLocalVersion();
  if (!opts.quietCheck) {
    console.log(`Termi v${current} (${NPM_PACKAGE})`);
    console.log('Checking for a newer version...');
  }

  const result = await checkForUpdate({ force: true });
  if (result.skipped || result.latest === null) {
    console.log('Could not reach npm right now. Try again later.');
    return;
  }
  if (!result.updateAvailable) {
    console.log(`You already have the latest version (v${result.current}).`);
    return;
  }

  console.log(`Updating ${NPM_PACKAGE} from v${result.current} to v${result.latest}...`);
  const install = await installLatestUpdate();
  if (!install.ok) {
    console.log('The update did not finish.');
    console.log(style.dim(install.detail));
    console.log(
      style.dim(
        `You can also run: npm install -g ${NPM_PACKAGE}@latest`,
      ),
    );
    return;
  }
  console.log(`Updated to v${result.latest}.`);
  console.log('Quit and run termi again to use the new version.');
}
