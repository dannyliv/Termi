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
import { guardFetchState, guardProgressBar } from '../safety/guarddownload.js';
import { nameIsOkay } from '../safety/prefilter.js';
import { scaffolds, scaffoldById } from '../projects/scaffolds/index.js';
import { suggestProjectNames } from '../setup/wizard.js';
import { BADGES, celebrate, confetti, renderBadgeShelf } from '../ui/celebrate.js';
import { mascot } from '../ui/mascot.js';
import { style } from '../ui/theme.js';
import { T } from '../ui/text.js';
import type { Settings } from '../types.js';
import type { ProjectContext } from '../projects/store.js';
import { executeIdeas } from './commands.js';

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
type CreateModule = typeof import('../projects/create.js');

async function loadProjectModules(): Promise<{ store: StoreModule; create: CreateModule } | null> {
  try {
    const store = await import('../projects/store.js');
    const create = await import('../projects/create.js');
    return { store, create };
  } catch {
    return null;
  }
}

const CUSTOM_NAME = '__custom__';

async function pickProjectName(themeLabel: string): Promise<string | null> {
  const suggestions = suggestProjectNames(themeLabel);
  const pick = await p.select<string>({
    message: 'Pick a name.',
    options: [
      ...suggestions.map((name) => ({ value: name, label: name })),
      { value: CUSTOM_NAME, label: 'Type my own name' },
    ],
  });
  if (p.isCancel(pick)) {
    return null;
  }
  if (pick !== CUSTOM_NAME) {
    return pick;
  }
  const typed = await p.text({
    message: 'What is its name?',
    validate: (value) => {
      const trimmed = (value ?? '').trim();
      if (trimmed.length === 0) return 'It needs a name.';
      if (!nameIsOkay(trimmed)) return 'That name will not work. Try another one.';
      return undefined;
    },
  });
  if (p.isCancel(typed)) {
    return null;
  }
  return typed.trim();
}

async function remixFlow(
  store: StoreModule,
  create: CreateModule,
): Promise<ProjectContext | null> {
  const metas = store.listProjects();
  const sourceSlug = await p.select<string>({
    message: 'Which project do you want to remix?',
    options: metas.map((m) => ({ value: m.slug, label: m.prettyName })),
  });
  if (p.isCancel(sourceSlug)) {
    return null;
  }
  const source = store.openProject(sourceSlug);
  if (source === null) {
    p.log.warn('I could not open that one.');
    return null;
  }
  for (;;) {
    const name = await p.text({
      message: 'Name your remix.',
      validate: (value) => ((value ?? '').trim().length > 0 ? undefined : 'It needs a name.'),
    });
    if (p.isCancel(name)) {
      return null;
    }
    const trimmed = name.trim();
    if (create.slugifyName(trimmed).collision) {
      p.log.warn('That name is taken. Try another one.');
      continue;
    }
    const made = create.createProject(source.meta.scaffoldId, source.meta.themeId, trimmed);
    for (const file of source.listKidFiles()) {
      const content = source.readFile(file.relPath);
      if (content !== null) {
        made.project.writeFile(file.relPath, content);
      }
    }
    await awardBadge('remixer');
    return made.project;
  }
}

/**
 * The full new-project flow: scaffold, theme, name (with collision help),
 * remix option, badges. Returns the created project, or null on cancel.
 */
export async function runNewProject(settings: Settings): Promise<ProjectContext | null> {
  void settings;
  const mods = await loadProjectModules();
  if (mods === null) {
    p.log.warn('Project tools are not ready yet.');
    return null;
  }
  const { store, create } = mods;
  const existing = store.listProjects();
  const options: { value: string; label: string; hint?: string }[] = scaffolds.map((s) => ({
    value: s.id,
    label: `${s.emoji} ${s.label}`,
    hint: s.ageNote,
  }));
  if (existing.length > 0) {
    options.push({
      value: '__remix__',
      label: 'Remix one of your projects',
      hint: 'Copy a project and make it new.',
    });
  }
  const pick = await p.select<string>({ message: 'What do you want to make?', options });
  if (p.isCancel(pick)) {
    return null;
  }
  if (pick === '__remix__') {
    return remixFlow(store, create);
  }
  const scaffold = scaffoldById(pick);
  if (scaffold === undefined) {
    return null;
  }
  const themeId = await p.select<string>({
    message: 'Pick a style.',
    options: scaffold.themes.map((t) => ({ value: t.id, label: `${t.emoji} ${t.label}` })),
  });
  if (p.isCancel(themeId)) {
    return null;
  }
  const theme = scaffold.themes.find((t) => t.id === themeId);
  if (theme === undefined) {
    return null;
  }

  let prettyName = await pickProjectName(theme.label);
  if (prettyName === null) {
    return null;
  }
  const slugInfo = create.slugifyName(prettyName);
  if (slugInfo.collision) {
    const what = await p.select<string>({
      message: 'You already have a project with that name.',
      options: [
        { value: 'open', label: 'Open it' },
        { value: 'suffix', label: `Call this one ${prettyName} 2` },
        { value: 'rename', label: 'Pick a new name' },
      ],
    });
    if (p.isCancel(what)) {
      return null;
    }
    if (what === 'open') {
      return store.openProject(slugInfo.slug);
    }
    if (what === 'suffix') {
      prettyName = `${prettyName} 2`;
    } else {
      const again = await pickProjectName(theme.label);
      if (again === null) {
        return null;
      }
      prettyName = again;
    }
  }

  const made = create.createProject(scaffold.id, theme.id, prettyName);
  await awardBadge('first-project');
  if (store.listProjects().length >= 5) {
    await awardBadge('five-projects');
  }
  const starters = made.starterPrompts.slice(0, 2);
  if (starters.length > 0) {
    p.note(starters.map((line) => `- ${line}`).join('\n'), 'Try saying');
  }
  return made.project;
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
    const next = await runNewProject(settings);
    if (next === null) {
      return;
    }
    current = next;
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

/** The home menu loop for a returning kid. */
export async function showHome(settings: Settings): Promise<void> {
  let guardWasLoading = false;
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
    // "it is on now" note the first time the menu renders after it lands.
    const fetchState = guardFetchState();
    if (settings.localClassifier && fetchState.status === 'downloading') {
      console.log(style.dim(`${T.home.guardLoading} ${guardProgressBar(fetchState)}`));
      guardWasLoading = true;
    } else if (guardWasLoading && fetchState.status === 'ready') {
      console.log(style.dim(T.home.guardOn));
      guardWasLoading = false;
    }

    const options: { value: string; label: string }[] = [];
    if (last !== null) {
      options.push({ value: 'continue', label: `Keep building ${last.context.meta.prettyName}` });
    }
    options.push(
      { value: 'open', label: T.home.menuGo },
      { value: 'new', label: T.home.menuNew },
      { value: 'ideas', label: T.home.menuIdeas },
      { value: 'learn', label: 'Learn AI tricks' },
      { value: 'badges', label: T.home.menuBadges },
      { value: 'grownups', label: T.home.menuGrownups },
      { value: 'quit', label: T.home.menuQuit },
    );
    const pick = await p.select<string>({
      message: 'What now?',
      options,
      initialValue: last !== null ? 'continue' : 'new',
    });
    if (p.isCancel(pick) || pick === 'quit') {
      p.outro(T.home.goodbye);
      return;
    }
    if (pick === 'continue' && last !== null) {
      await openChatLoop(last.context, settings);
    } else if (pick === 'open') {
      await openPicked(settings);
    } else if (pick === 'new') {
      const made = await runNewProject(settings);
      if (made !== null) {
        await openChatLoop(made, settings);
      }
    } else if (pick === 'ideas') {
      const scaffoldId = last !== null ? last.context.meta.scaffoldId : 'games';
      await executeIdeas(scaffoldId, (text) => {
        console.log(text);
      });
    } else if (pick === 'learn') {
      try {
        const learn = await import('../learn/runner.js');
        await learn.runLearnMenu();
      } catch {
        p.log.warn('Learn mode is taking a nap. Try again soon.');
      }
    } else if (pick === 'badges') {
      console.log(renderBadgeShelf(loadBadges()));
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
  const mods = await loadProjectModules();
  if (mods === null) {
    p.log.warn('Project tools are not ready yet.');
    return;
  }
  const metas = mods.store.listProjects();
  if (metas.length === 0) {
    p.log.info('No projects yet. Pick "Make something new"!');
    return;
  }
  const first = metas[0];
  const initial =
    settings.lastProjectSlug !== null && metas.some((m) => m.slug === settings.lastProjectSlug)
      ? settings.lastProjectSlug
      : first?.slug;
  const pick = await p.select<string>({
    message: 'Pick a project.',
    options: metas.map((m) => ({ value: m.slug, label: m.prettyName })),
    ...(initial !== undefined ? { initialValue: initial } : {}),
  });
  if (p.isCancel(pick)) {
    return;
  }
  const project = mods.store.openProject(pick);
  if (project === null) {
    p.log.warn('I could not open that one.');
    return;
  }
  await openChatLoop(project, settings);
}
