/**
 * The big "Termi" banner shown on launch.
 * Figlet art through the brand gradient, with a plain fallback.
 */

import figlet from 'figlet';
import chalk from 'chalk';
import { colorsOk, gradientBlock, style, unicodeOk } from './theme.js';

/** One line under the logo. Short and friendly. */
export const TAGLINE = 'Build games, art, and stories with your robot buddy.';

let cachedArt: string | null = null;
let figletRenders = 0;

/** Figlet is sync and a bit slow, so render once and keep it. */
function figletArt(): string {
  if (cachedArt === null) {
    figletRenders += 1;
    cachedArt = figlet.textSync('Termi', { font: 'Standard' });
  }
  return cachedArt;
}

/**
 * Render the launch banner.
 * Full mode: gradient figlet art plus a dim tagline.
 * Plain mode (no colors or ASCII terminals): bold name plus tagline.
 */
export function renderBanner(): string {
  if (!unicodeOk() || !colorsOk()) {
    return `${chalk.bold('Termi')}\n${TAGLINE}`;
  }
  const art = figletArt().replace(/\s+$/u, '');
  return `${gradientBlock(art)}\n${style.dim(TAGLINE)}`;
}

/** Test hook: how many times figlet actually ran. */
export function bannerRenderCount(): number {
  return figletRenders;
}
