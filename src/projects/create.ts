/**
 * Project creation: turn a scaffold, a theme, and a name into a real
 * project on disk, ready for the preview server before any model call.
 */

import fs from 'node:fs';
import path from 'node:path';
import { projectsDir } from '../config/paths.js';
import { scaffoldById } from './scaffolds/index.js';
import {
  notesFileName,
  openProject,
  renderTermiMd,
  saveProjectMeta,
  type ProjectContext,
} from './store.js';

/** Slugs may never be a Windows reserved device name. */
const windowsReserved = new Set(['con', 'prn', 'aux', 'nul']);
for (let i = 1; i <= 9; i += 1) {
  windowsReserved.add(`com${i}`);
  windowsReserved.add(`lpt${i}`);
}

const maxSlugLength = 40;

/**
 * Turns a pretty name into a safe folder slug.
 * Lowercase a-z, 0-9 and dashes only. Emoji and accents are dropped.
 * Empty results become "my-project". Windows reserved names get "-app".
 * If the slug's folder already exists, a free "-2", "-3"... slug is
 * returned and collision is true.
 */
export function slugifyName(input: string): { slug: string; collision: boolean } {
  let s = input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  if (s.length > maxSlugLength) {
    s = s.slice(0, maxSlugLength).replace(/-+$/, '');
  }
  if (s.length === 0) s = 'my-project';
  if (windowsReserved.has(s)) s = `${s}-app`;

  const taken = (slug: string): boolean => fs.existsSync(path.join(projectsDir(), slug));
  if (!taken(s)) {
    return { slug: s, collision: false };
  }
  let n = 2;
  while (taken(`${s}-${n}`)) n += 1;
  return { slug: `${s}-${n}`, collision: true };
}

function writeRel(dir: string, relPath: string, content: string): void {
  const target = path.join(dir, ...relPath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

/**
 * Creates a new project from a scaffold and theme.
 * Writes the kid files, any vendored engine files, TERMI.md, and
 * .termi.json, then opens the project. Throws kid-readable errors.
 */
export function createProject(
  scaffoldId: string,
  themeId: string,
  prettyNameInput: string,
): { project: ProjectContext; starterPrompts: string[] } {
  const scaffold = scaffoldById(scaffoldId);
  if (!scaffold) {
    throw new Error('I do not know that project type. Pick one from the menu.');
  }
  const theme = scaffold.themes.find((t) => t.id === themeId);
  if (!theme) {
    throw new Error('I do not know that style. Pick one from the list.');
  }
  const trimmed = prettyNameInput.trim();
  const prettyName = trimmed.length > 0 ? trimmed : 'My Project';
  const { slug } = slugifyName(prettyName);
  const dir = path.join(projectsDir(), slug);
  fs.mkdirSync(dir, { recursive: true });

  const files = scaffold.files(theme, prettyName);
  for (const [relPath, content] of Object.entries(files)) {
    writeRel(dir, relPath, content);
  }
  for (const [relPath, content] of Object.entries(scaffold.vendorFiles ?? {})) {
    writeRel(dir, relPath, content);
  }

  if (!(notesFileName in files)) {
    const kidFiles = Object.keys(files).filter((f) => f !== notesFileName);
    writeRel(
      dir,
      notesFileName,
      renderTermiMd(prettyName, {
        whatThisIs: `A ${scaffold.label} starter. ${theme.narrativeIntro}`,
        files: kidFiles,
        builtSoFar: [`Started from the ${scaffold.label} starter`],
        recapLine: `We just made ${prettyName}!`,
      }),
    );
  }

  const now = new Date().toISOString();
  saveProjectMeta({
    slug,
    prettyName,
    scaffoldId,
    themeId,
    createdAt: now,
    lastOpenedAt: now,
  });

  const project = openProject(slug);
  if (project === null) {
    throw new Error('Something went wrong while making the project. Try again.');
  }
  return { project, starterPrompts: scaffold.starterPrompts(theme) };
}
