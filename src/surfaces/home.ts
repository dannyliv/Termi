/**
 * The home menu, the new-project flow, and the badge shelf state.
 *
 * Badge state is a small JSON file at TERMI_HOME/badges.json. markBadge
 * returns true only on a first earn, and awardBadge celebrates that moment.
 * Cross-wave modules (project store, create, chat) load lazily inside the
 * functions that need them, so this module imports cleanly on its own.
 */

import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { atomicWriteFileSync, termiHome } from '../config/paths.js';
import { saveSettings } from '../config/settings.js';
import {
  consumeGuardReadyNotice,
  guardFetchState,
  guardProgressBar,
} from '../safety/guarddownload.js';
import { BADGES, celebrate, confetti } from '../ui/celebrate.js';
import { mascot } from '../ui/mascot.js';
import { style } from '../ui/theme.js';
import { T } from '../ui/text.js';
import type { Settings } from '../types.js';
import type { ProjectContext } from '../projects/store.js';

/** Where the earned-badge list lives. */
export function badgesFilePath(): string {
  return path.join(termiHome(), 'badges.json');
}

/** The earned badge ids, oldest first. Missing or broken file means none. */
export function loadBadges(): string[] {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(badgesFilePath(), 'utf8'));
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const earned = (parsed as { earned?: unknown }).earned;
      if (Array.isArray(earned)) {
        return earned.filter((id): id is string => typeof id === 'string');
      }
    }
  } catch {
    // No file yet means no badges yet.
  }
  return [];
}

/**
 * Records a badge as earned. Returns true only the first time, false for
 * repeats and for ids that are not real badges.
 */
export function markBadge(id: string): boolean {
  if (!BADGES.some((badge) => badge.id === id)) {
    return false;
  }
  const earned = loadBadges();
  if (earned.includes(id)) {
    return false;
  }
  earned.push(id);
  atomicWriteFileSync(badgesFilePath(), JSON.stringify({ earned }, null, 2));
  return true;
}

/**
 * Marks a badge and, on a first earn, throws a small celebration.
 * Returns true when this was the first earn.
 */
export async function awardBadge(
  id: string,
  write: (text: string) => void = (text) => {
    console.log(text);
  },
): Promise<boolean> {
  const first = markBadge(id);
  if (!first) {
    return false;
  }
  const def = BADGES.find((badge) => badge.id === id);
  const label = def !== undefined ? def.label : id;
  const fast = process.env.TERMI_FAST_TEXT === '1';
  await confetti(4, { delayMs: fast ? 0 : 70, write: (chunk) => write(chunk.replace(/\n$/, '')) });
  write(celebrate(T.celebrations.badgeEarned.replace('{badge}', label)));
  return true;
}

/**
 * Pulls the recap line out of a TERMI.md body. Tolerant of two shapes:
 * an inline "Recap: ..." line (bullets and bold allowed) and a
 * "## Recap" heading followed by the recap text.
 */
export function recapFromTermiMd(text: string): string | null {
  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/\*\*/g, '').replace(/^[-*]\s*/, '');
    const inline = /^recap(?:[ -]?line)?\s*[:=]\s*(.+)$/i.exec(line);
    if (inline?.[1] !== undefined && inline[1].trim().length > 0) {
      return inline[1].trim();
    }
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (/^#{1,6}\s*recap/i.test(lines[i]?.trim() ?? '')) {
      for (let j = i + 1; j < lines.length; j += 1) {
        const candidate = lines[j]?.trim() ?? '';
        if (candidate.length > 0 && !candidate.startsWith('#')) {
          return candidate.replace(/^[-*]\s*/, '');
        }
      }
    }
  }
  return null;
}

type StoreModule = typeof import('../projects/store.js');

async function loadStore(): Promise<StoreModule | null> {
  try {
    return await import('../projects/store.js');
  } catch {
    return null;
  }
}

/**
 * New project entry: always Build a game (blank shell + idea list).
 * Multi-scaffold stock starters are no longer on the kid path.
 */
export async function runNewProject(settings: Settings): Promise<ProjectContext | null> {
  try {
    const build = await import('./buildGame.js');
    return await build.runBuildGame(settings);
  } catch {
    p.log.warn('Build a game is taking a nap. Try again soon.');
    return null;
  }
}

/**
 * Opens the chat for a project and keeps going while the kid asks for
 * a new project from inside the chat.
 */
export async function openChatLoop(project: ProjectContext, settings: Settings): Promise<void> {
  let current = project;
  for (;;) {
    settings.lastProjectSlug = current.meta.slug;
    try {
      saveSettings(settings);
    } catch {
      // The chat still works when settings cannot persist.
    }
    let exit: 'quit' | 'new' = 'quit';
    try {
      const chat = await import('./chat.js');
      exit = await chat.runChat(current, settings);
    } catch {
      p.log.warn('The build chat is not ready yet.');
      return;
    }
    if (exit !== 'new') {
      return;
    }
    // /new always opens Build a game (blank shell + ideas), never the
    // multi-scaffold stock-project picker.
    try {
      const build = await import('./buildGame.js');
      const next = await build.runBuildGame(settings);
      if (next === null) {
        return;
      }
      current = next;
    } catch {
      p.log.warn('Build a game is taking a nap. Try again soon.');
      return;
    }
  }
}

interface LastProject {
  context: ProjectContext;
  recap: string | null;
}

async function loadLastProject(settings: Settings): Promise<LastProject | null> {
  if (settings.lastProjectSlug === null) {
    return null;
  }
  try {
    const store = await import('../projects/store.js');
    const context = store.openProject(settings.lastProjectSlug);
    if (context === null) {
      return null;
    }
    let recap: string | null = null;
    try {
      recap = recapFromTermiMd(context.readTermiMd());
    } catch {
      recap = null;
    }
    return { context, recap };
  } catch {
    return null;
  }
}

/** Kid home menu values (simplified product surface). */
export const HOME_MENU_VALUES = [
  'build',
  'library',
  'learn',
  'continue',
  'grownups',
  'quit',
] as const;

export type HomeMenuValue = (typeof HOME_MENU_VALUES)[number];

/**
 * Pure home option list for tests. Build a game and Learn AI are always
 * present; continue and library depend on whether projects exist.
 */
export function homeMenuOptions(hasLast: boolean, hasLibrary: boolean): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  if (hasLast) {
    options.push({ value: 'continue', label: T.home.menuContinue });
  }
  options.push(
    { value: 'build', label: T.home.menuBuild },
    { value: 'library', label: T.home.menuLibrary },
    { value: 'learn', label: T.home.menuLearn },
    { value: 'grownups', label: T.home.menuGrownups },
    { value: 'quit', label: T.home.menuQuit },
  );
  if (!hasLibrary) {
    // Library stays listed so kids discover where games are saved.
    void hasLibrary;
  }
  return options;
}

/** The home menu loop for a returning kid. */
export async function showHome(settings: Settings): Promise<void> {
  const nickname = settings.kidNickname.trim();
  console.log(mascot('happy'));
  console.log(
    nickname.length > 0 ? T.home.welcomeBack.replace('{name}', nickname) : T.home.firstHello,
  );
  let last = await loadLastProject(settings);
  if (last !== null) {
    if (last.recap !== null) {
      console.log(style.dim(T.home.recapIntro.replace('{recap}', last.recap)));
    }
    console.log(T.home.nextStep);
  }

  for (;;) {
    // A quiet one-liner while the safety checker still downloads, and one
    // "it is on now" note when it lands (shared one-shot with the chat, so
    // the kid never hears it twice across screens).
    const fetchState = guardFetchState();
    if (settings.localClassifier && fetchState.status === 'downloading') {
      console.log(style.dim(`${T.home.guardLoading} ${guardProgressBar(fetchState)}`));
    } else if (consumeGuardReadyNotice()) {
      console.log(style.dim(T.home.guardOn));
    }

    let hasLibrary = false;
    try {
      const store = await import('../projects/store.js');
      hasLibrary = store.listProjects().length > 0;
    } catch {
      hasLibrary = false;
    }

    const options = homeMenuOptions(last !== null, hasLibrary);
    const pick = await p.select<string>({
      message: 'What now?',
      options,
      initialValue: last !== null ? 'continue' : 'build',
    });
    if (p.isCancel(pick) || pick === 'quit') {
      p.outro(T.home.goodbye);
      return;
    }
    if (pick === 'continue' && last !== null) {
      await openChatLoop(last.context, settings);
    } else if (pick === 'library') {
      await openPicked(settings);
    } else if (pick === 'build') {
      try {
        const build = await import('./buildGame.js');
        const made = await build.runBuildGame(settings);
        if (made !== null) {
          settings.lastProjectSlug = made.meta.slug;
          try {
            saveSettings(settings);
          } catch {
            //
          }
        }
      } catch {
        p.log.warn('Build a game is taking a nap. Try again soon.');
      }
    } else if (pick === 'learn') {
      try {
        const learn = await import('../learn/runner.js');
        await learn.runLearnMenu();
      } catch {
        p.log.warn('Learn mode is taking a nap. Try again soon.');
      }
    } else if (pick === 'grownups') {
      try {
        const panel = await import('../grownups/panel.js');
        await panel.runPanel();
      } catch {
        p.log.warn(T.grownups.needsGrownup);
      }
    }
    last = await loadLastProject(settings);
  }
}

async function openPicked(settings: Settings): Promise<void> {
  const store = await loadStore();
  if (store === null) {
    p.log.warn('Project tools are not ready yet.');
    return;
  }
  const metas = store.listProjects();
  if (metas.length === 0) {
    p.log.info('No games yet. Pick "Build a game"!');
    return;
  }
  const first = metas[0];
  const initial =
    settings.lastProjectSlug !== null && metas.some((m) => m.slug === settings.lastProjectSlug)
      ? settings.lastProjectSlug
      : first?.slug;
  const pick = await p.select<string>({
    message: 'Pick a game.',
    options: metas.map((m) => ({ value: m.slug, label: m.prettyName })),
    ...(initial !== undefined ? { initialValue: initial } : {}),
  });
  if (p.isCancel(pick)) {
    return;
  }
  const project = store.openProject(pick);
  if (project === null) {
    p.log.warn('I could not open that one.');
    return;
  }
  await openChatLoop(project, settings);
}
