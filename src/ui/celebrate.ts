/**
 * Celebrations: confetti, the hooray box, and the badge shelf.
 * Celebrations stay unexpected. No currency, no streaks, no pressure.
 */

import boxen from 'boxen';
import { mascot } from './mascot.js';
import { style, unicodeOk } from './theme.js';

export interface BadgeDef {
  id: string;
  label: string;
  emoji: string;
  hint: string;
}

/** The full badge set. Triggers live with the features that earn them. */
export const BADGES: readonly BadgeDef[] = [
  {
    id: 'first-project',
    label: 'First Project',
    emoji: '\u{1F331}',
    hint: 'Make your first project.',
  },
  {
    id: 'first-change',
    label: 'First Change',
    emoji: '\u{1F58D}',
    hint: 'Ask Termi to change your project.',
  },
  {
    id: 'game-shipped',
    label: 'Game Shipped',
    emoji: '\u{1F680}',
    hint: 'Finish a game with /done.',
  },
  {
    id: 'bug-squasher',
    label: 'Bug Squasher',
    emoji: '\u{1F41B}',
    hint: 'Fix a bug with Termi.',
  },
  {
    id: 'remixer',
    label: 'Remixer',
    emoji: '\u{1F300}',
    hint: 'Remix one of your projects.',
  },
  {
    id: 'five-projects',
    label: 'Five Projects',
    emoji: '\u{1F3C6}',
    hint: 'Make five projects.',
  },
];

export interface ConfettiOptions {
  /** Milliseconds between frames. Use 0 in tests. */
  delayMs?: number;
  /** Columns of confetti per line. */
  width?: number;
  /** Where frames go. Defaults to process.stdout. */
  write?: (chunk: string) => void;
  /** Random source, injectable for tests. */
  rng?: () => number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CONFETTI_UNICODE = ['✨', '✦', '✶', '•', '*'] as const;
const CONFETTI_ASCII = ['*', '+', '.', 'o', '~'] as const;

/** Print a short confetti burst, one line per frame. */
export async function confetti(frames = 6, opts: ConfettiOptions = {}): Promise<void> {
  const delayMs = opts.delayMs ?? 80;
  const width = opts.width ?? 36;
  const write = opts.write ?? ((chunk: string): void => void process.stdout.write(chunk));
  const rng = opts.rng ?? Math.random;
  const pieces: readonly string[] = unicodeOk() ? CONFETTI_UNICODE : CONFETTI_ASCII;

  for (let f = 0; f < frames; f += 1) {
    let line = '';
    for (let i = 0; i < width; i += 1) {
      if (rng() < 0.28) {
        line += pieces[Math.floor(rng() * pieces.length)] ?? '*';
      } else {
        line += ' ';
      }
    }
    write(`${line}\n`);
    if (delayMs > 0) await sleep(delayMs);
  }
}

/** A boxed hooray moment with the celebrating mascot. */
export function celebrate(message: string): string {
  const body = `${mascot('celebrating')}\n\n${message}`;
  return boxen(body, {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    borderStyle: unicodeOk() ? 'round' : 'classic',
    borderColor: 'magenta',
  });
}

/** Render the badge shelf: earned badges shine, locked ones show their hint. */
export function renderBadgeShelf(earnedIds: string[]): string {
  const earned = new Set(earnedIds);
  const unicode = unicodeOk();
  const lines = BADGES.map((badge) => {
    if (earned.has(badge.id)) {
      const mark = unicode ? badge.emoji : '[*]';
      return ` ${mark}  ${style.title(badge.label)}`;
    }
    const mark = unicode ? '\u{1F512}' : '[ ]';
    return ` ${mark}  ${style.dim(badge.label)}  ${style.dim(badge.hint)}`;
  });
  const count = BADGES.filter((badge) => earned.has(badge.id)).length;
  const header = style.title('Your badges');
  const tally = `You earned ${count} of ${BADGES.length} badges.`;
  return [header, ...lines, '', tally].join('\n');
}
