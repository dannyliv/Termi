/**
 * Central look-and-feel helpers for every Termi screen.
 * One palette, one glyph map, one unicode check. Everything else imports from here.
 */

import chalk from 'chalk';
import gradient from 'gradient-string';
import isUnicodeSupported from 'is-unicode-supported';

let unicodeDetected: boolean | null = null;

/**
 * True when the terminal can show emoji and box drawing.
 * The expensive detection runs once and is cached.
 * Env overrides (checked on every call so tests can flip them):
 *   TERMI_ASCII=1 forces plain ASCII output.
 *   TERMI_ASCII=0 forces unicode output.
 */
export function unicodeOk(): boolean {
  const override = process.env['TERMI_ASCII'];
  if (override === '1') return false;
  if (override === '0') return true;
  if (unicodeDetected === null) unicodeDetected = isUnicodeSupported();
  return unicodeDetected;
}

/** Test hook: forget the cached terminal detection. */
export function resetUnicodeCache(): void {
  unicodeDetected = null;
}

/** True when the terminal renders ANSI colors. */
export function colorsOk(): boolean {
  return chalk.level > 0;
}

/**
 * Termi brand palette: teal to purple to orange.
 * Bright and friendly for every kid, with no color coded for anyone.
 */
export const PALETTE = {
  teal: '#2dd4bf',
  purple: '#a78bfa',
  orange: '#fb923c',
} as const;

const termiGradient = gradient([PALETTE.teal, PALETTE.purple, PALETTE.orange]);

/** Apply the brand gradient to a single line. Falls back to bold text. */
export function gradientLine(text: string): string {
  return colorsOk() ? termiGradient(text) : chalk.bold(text);
}

/** Apply the brand gradient across a multi-line block. Falls back to bold text. */
export function gradientBlock(text: string): string {
  return colorsOk() ? termiGradient.multiline(text) : chalk.bold(text);
}

/** Named text styles so screens never call chalk directly. */
export const style = {
  title: chalk.bold,
  accent: chalk.hex(PALETTE.purple),
  happy: chalk.hex(PALETTE.teal),
  warm: chalk.hex(PALETTE.orange),
  dim: chalk.dim,
  good: chalk.green,
  warn: chalk.yellow,
  bad: chalk.red,
} as const;

export type GlyphName =
  | 'sparkles'
  | 'robot'
  | 'rocket'
  | 'star'
  | 'heart'
  | 'check'
  | 'cross'
  | 'paint'
  | 'music'
  | 'paw'
  | 'book'
  | 'question'
  | 'globe'
  | 'speech'
  | 'party'
  | 'lock'
  | 'key'
  | 'bulb'
  | 'wrench'
  | 'zap';

/** One map for every symbol: emoji for modern terminals, ASCII for the rest. */
const GLYPHS: Record<GlyphName, { emoji: string; ascii: string }> = {
  sparkles: { emoji: '✨', ascii: '*' },
  robot: { emoji: '\u{1F916}', ascii: '[o_o]' },
  rocket: { emoji: '\u{1F680}', ascii: '>>' },
  star: { emoji: '⭐', ascii: '*' },
  heart: { emoji: '\u{1F499}', ascii: '<3' },
  check: { emoji: '✅', ascii: '+' },
  cross: { emoji: '❌', ascii: 'x' },
  paint: { emoji: '\u{1F3A8}', ascii: '~' },
  music: { emoji: '\u{1F3B5}', ascii: 'd' },
  paw: { emoji: '\u{1F43E}', ascii: '::' },
  book: { emoji: '\u{1F4D6}', ascii: '[=]' },
  question: { emoji: '❓', ascii: '?' },
  globe: { emoji: '\u{1F310}', ascii: '(o)' },
  speech: { emoji: '\u{1F4AC}', ascii: '(..)' },
  party: { emoji: '\u{1F389}', ascii: '\\o/' },
  lock: { emoji: '\u{1F512}', ascii: '[#]' },
  key: { emoji: '\u{1F511}', ascii: '-o' },
  bulb: { emoji: '\u{1F4A1}', ascii: '(!)' },
  wrench: { emoji: '\u{1F527}', ascii: '/-' },
  zap: { emoji: '⚡', ascii: '!' },
};

/** Returns the emoji for a name, or its ASCII stand-in on plain terminals. */
export function glyph(name: GlyphName): string {
  const entry = GLYPHS[name];
  return unicodeOk() ? entry.emoji : entry.ascii;
}

/** Every glyph name, for tests and pickers. */
export const glyphNames: readonly GlyphName[] = Object.keys(GLYPHS) as GlyphName[];
