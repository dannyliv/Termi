/**
 * Chat command parsing and execution helpers.
 *
 * Parsing is pure and synchronous so it is easy to test. Execution helpers
 * take every dependency as an argument, which keeps chat.ts a thin shell
 * and keeps this module importable before the rest of the wave lands.
 */

import type { PreviewHandle, SnapshotStore } from '../types.js';
import { celebrate } from '../ui/celebrate.js';
import { T } from '../ui/text.js';
import { glyph } from '../ui/theme.js';

/** Every slash command the chat understands, in help order. */
export const COMMAND_NAMES = [
  'preview',
  'undo',
  'redo',
  'new',
  'ideas',
  'badges',
  'learn',
  'help',
  'done',
  'quit',
  'grownups',
] as const;

export type CommandName = (typeof COMMAND_NAMES)[number];

/** Commands a kid can type as a plain word, no slash needed. */
export const BARE_WORDS: readonly CommandName[] = [
  'undo',
  'help',
  'ideas',
  'done',
  'preview',
  'badges',
  'learn',
  'quit',
];

/**
 * Leaving words kids type on their own. Each maps to quit so a goodbye
 * never becomes a paid AI turn.
 */
export const QUIT_SYNONYMS: readonly string[] = ['exit', 'stop', 'bye', 'leave'];

export type Command =
  | { kind: CommandName }
  | { kind: 'unknown'; word: string; suggestion: CommandName | null }
  | { kind: 'chat'; text: string };

/** Classic edit distance. Small inputs only, so the simple table is fine. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const next: number[] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      next[j] = Math.min((next[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = next;
  }
  return prev[b.length] ?? 0;
}

/** The closest known command within maxDistance edits, or null. */
export function nearestCommand(word: string, maxDistance = 2): CommandName | null {
  let best: CommandName | null = null;
  let bestDistance = maxDistance + 1;
  for (const name of COMMAND_NAMES) {
    const distance = levenshtein(word, name);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = name;
    }
  }
  return bestDistance <= maxDistance ? best : null;
}

/**
 * Turns raw kid input into a typed command.
 * Slash commands match by their first word. Unknown slash words get a
 * did-you-mean suggestion. Single bare words like "undo" also work.
 * Everything else is a chat message for the agent.
 */
export function parseCommand(raw: string): Command {
  const input = raw.trim();
  if (input.length === 0) {
    return { kind: 'chat', text: '' };
  }
  if (input.startsWith('/')) {
    const word = (input.slice(1).trim().split(/\s+/)[0] ?? '').toLowerCase();
    if ((COMMAND_NAMES as readonly string[]).includes(word)) {
      return { kind: word as CommandName };
    }
    if (QUIT_SYNONYMS.includes(word)) {
      return { kind: 'quit' };
    }
    return { kind: 'unknown', word, suggestion: nearestCommand(word) };
  }
  if (!/\s/.test(input)) {
    const lower = input.toLowerCase();
    if ((BARE_WORDS as readonly string[]).includes(lower)) {
      return { kind: lower as CommandName };
    }
    if (QUIT_SYNONYMS.includes(lower)) {
      return { kind: 'quit' };
    }
  }
  return { kind: 'chat', text: input };
}

/** Where command helpers print kid-facing lines. */
export type Say = (text: string) => void;

/** The kid-facing command list. */
export function helpText(): string {
  const rows: [string, string][] = [
    ['/preview', 'watch your project run'],
    ['/undo', 'take back the last change'],
    ['/redo', 'bring a change back'],
    ['/new', 'start a fresh project'],
    ['/ideas', 'get fun ideas'],
    ['/badges', 'see your badges'],
    ['/learn', 'play short AI lessons'],
    ['/help', 'show this list'],
    ['/done', 'finish and celebrate'],
    ['/quit', 'stop for today'],
    ['/grownups', 'grown-up zone, PIN needed'],
  ];
  const lines = rows.map(([cmd, what]) => `  ${cmd.padEnd(10)} ${what}`);
  return [
    'Here is what I can do:',
    ...lines,
    'Plain words work too, like undo, ideas, or quit.',
  ].join('\n');
}

/** Undo the last change and tell the preview to reload. */
export function executeUndo(
  snapshots: SnapshotStore,
  preview: PreviewHandle | null,
  say: Say,
): boolean {
  const ok = snapshots.undo();
  if (ok) {
    preview?.notifyChange();
    say(T.chat.undoDone);
  } else {
    say(T.chat.nothingToUndo);
  }
  return ok;
}

/** Bring back the change that undo removed. */
export function executeRedo(
  snapshots: SnapshotStore,
  preview: PreviewHandle | null,
  say: Say,
): boolean {
  const ok = snapshots.redo();
  if (ok) {
    preview?.notifyChange();
    say(T.chat.redoDone);
  } else {
    say(T.chat.nothingToRedo);
  }
  return ok;
}

/** Prints idea lines for a scaffold. Loads the idea bank lazily. */
export async function executeIdeas(scaffoldId: string, say: Say): Promise<void> {
  let ideas: string[] = [];
  try {
    const mod = await import('../projects/ideas.js');
    ideas = mod.getIdeas(scaffoldId);
  } catch {
    ideas = [];
  }
  if (ideas.length === 0) {
    say('I am out of ideas right now. Try /help.');
    return;
  }
  const bullet = glyph('bulb');
  say(['Here are some ideas:', ...ideas.map((idea) => `  ${bullet} ${idea}`)].join('\n'));
}

/** Reopens the browser at the preview URL. */
export async function executePreview(preview: PreviewHandle | null, say: Say): Promise<void> {
  if (preview === null) {
    say('The preview is not running right now.');
    return;
  }
  say(`${T.chat.previewOpened} ${preview.url}`);
  try {
    const mod = await import('open');
    await mod.default(preview.url);
  } catch {
    // The URL is printed above, so the kid can still open it by hand.
  }
}

/** What executeDone needs to know about the open project. */
export interface DoneTarget {
  scaffoldId: string;
  prettyName: string;
  /** Persists the recap line into the project notes. */
  updateRecap(line: string): void;
}

/** True for the project types where /done earns the Game Shipped badge. */
export function donEarnsGameBadge(scaffoldId: string): boolean {
  return scaffoldId === 'games' || scaffoldId === 'biggames';
}

/**
 * The /done moment: celebration, the Game Shipped badge for game projects,
 * and a recap line saved for the next session.
 */
export async function executeDone(
  target: DoneTarget,
  award: (badgeId: string) => Promise<boolean>,
  say: Say,
): Promise<void> {
  const isGame = donEarnsGameBadge(target.scaffoldId);
  say(celebrate(isGame ? T.celebrations.gameShipped : T.celebrations.generic));
  if (isGame) {
    await award('game-shipped');
  }
  try {
    target.updateRecap(`We finished ${target.prettyName}!`);
  } catch {
    // Notes are best effort; the celebration already happened.
  }
}
