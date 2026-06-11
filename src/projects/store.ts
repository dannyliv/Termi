/**
 * Project store: open kid projects, list them, and work with their files.
 *
 * Each project lives at projectsDir()/<slug>/ and holds:
 * - .termi.json   project metadata (ProjectMeta, written atomically)
 * - TERMI.md      the project notes the model reads and updates
 * - kid files     index.html, style.css, game.js, and friends
 * - vendor files  engine files like kaplay.mjs, never counted as kid files
 *
 * All file access is jailed to the project directory. Paths are resolved
 * and prefix-checked, with case folding on Windows.
 */

import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFileSync, projectsDir } from '../config/paths.js';

export interface ProjectMeta {
  slug: string;
  prettyName: string;
  scaffoldId: string;
  themeId: string;
  createdAt: string;
  lastOpenedAt: string;
}

export interface ProjectContext {
  meta: ProjectMeta;
  dir: string;
  listKidFiles(): { relPath: string; bytes: number }[];
  readFile(relPath: string): string | null;
  writeFile(relPath: string, content: string): void;
  readTermiMd(): string;
  updateTermiMd(fields: { whatThisIs?: string; builtSoFar?: string[]; recapLine?: string }): void;
  touch(): void;
}

/** The metadata file inside every project directory. */
export const metaFileName = '.termi.json';

/** The notes file the model keeps for the kid. Not a kid file. */
export const notesFileName = 'TERMI.md';

/** Vendored engine files. Present on disk, never counted or touched as kid files. */
const vendorEngineFiles = new Set(['kaplay.mjs']);

/** Largest size a single kid file may be, in bytes. */
export const maxKidFileBytes = 256 * 1024;

/** TERMI.md never grows past this many lines. */
export const maxTermiMdLines = 60;

const outsideProjectMessage = 'That file is outside your project. Termi will not touch it.';
const specialNameMessage = 'That file name is off limits. Pick a different name.';
const tooLargeMessage = 'That file is too big. Keep each file under 256 KB.';

function caseFold(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

/**
 * Resolves a relative path inside the project directory.
 * Returns null when the path is absolute, empty, or escapes the project.
 */
function resolveInside(dir: string, relPath: string): string | null {
  if (typeof relPath !== 'string' || relPath.trim().length === 0) return null;
  if (path.isAbsolute(relPath)) return null;
  const base = path.resolve(dir);
  const resolved = path.resolve(base, relPath);
  if (caseFold(resolved) === caseFold(base)) return null;
  if (!caseFold(resolved).startsWith(caseFold(base + path.sep))) return null;
  return resolved;
}

/** Real path segments, with empty and "." entries dropped. */
function segmentsOf(relPath: string): string[] {
  return relPath.split(/[\\/]/).filter((s) => s.length > 0 && s !== '.');
}

/** True for dotfiles (like .termi.json) anywhere in the path. */
function hasDotSegment(relPath: string): boolean {
  return segmentsOf(relPath).some((s) => s.startsWith('.'));
}

/** True for vendored engine files like kaplay.mjs. */
export function isVendorFile(relPath: string): boolean {
  const segs = segmentsOf(relPath);
  const last = segs.length > 0 ? segs[segs.length - 1] : undefined;
  return last !== undefined && vendorEngineFiles.has(last);
}

/**
 * Lists kid files under a directory. Excludes TERMI.md, dotfiles
 * (which covers .termi.json), and vendored engine files.
 */
function walkKidFiles(dir: string): { relPath: string; bytes: number }[] {
  const out: { relPath: string; bytes: number }[] = [];
  const visit = (current: string, relParts: string[]): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const childParts = [...relParts, entry.name];
      const childAbs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(childAbs, childParts);
        continue;
      }
      if (!entry.isFile()) continue;
      const relPath = childParts.join('/');
      if (relPath === notesFileName) continue;
      if (vendorEngineFiles.has(relPath)) continue;
      let bytes = 0;
      try {
        bytes = fs.statSync(childAbs).size;
      } catch {
        continue;
      }
      out.push({ relPath, bytes });
    }
  };
  visit(dir, []);
  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}

/** Flattens a value to one safe line. Leading #, - and > marks are stripped. */
function sanitizeLine(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s#>-]+/, '').trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TermiMdFields {
  whatThisIs: string;
  files: string[];
  builtSoFar: string[];
  recapLine: string;
}

/**
 * Renders TERMI.md with the exact template headings.
 * Field text can never break the heading structure, and the result
 * stays at or under maxTermiMdLines. Oldest "Built so far" bullets
 * are dropped first when space runs out.
 */
export function renderTermiMd(prettyName: string, fields: TermiMdFields): string {
  const title = sanitizeLine(prettyName) || 'My Project';
  const what = sanitizeLine(fields.whatThisIs) || 'A Termi project.';
  let files = fields.files.map(sanitizeLine).filter((f) => f.length > 0);
  let built = fields.builtSoFar.map(sanitizeLine).filter((b) => b.length > 0);
  if (built.length === 0) built = ['Just getting started.'];
  const recap = sanitizeLine(fields.recapLine) || 'We are just getting started.';

  const compose = (): string[] => [
    `# ${title}`,
    '',
    '## What this is',
    what,
    '',
    '## Files',
    ...files.map((f) => `- ${f}`),
    '',
    '## Built so far',
    ...built.map((b) => `- ${b}`),
    '',
    '## Recap line',
    recap,
    '',
  ];

  let lines = compose();
  while (lines.length > maxTermiMdLines && built.length > 1) {
    built = built.slice(1);
    lines = compose();
  }
  while (lines.length > maxTermiMdLines && files.length > 1) {
    files = files.slice(0, -1);
    lines = compose();
  }
  return lines.join('\n');
}

/** Pulls the template fields back out of TERMI.md text. */
export function parseTermiMd(content: string): TermiMdFields {
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading && heading[1] !== undefined) {
      current = heading[1].trim().toLowerCase();
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (/^#\s/.test(line)) continue;
    if (current !== null) sections.get(current)?.push(line);
  }
  const grab = (name: string): string[] =>
    (sections.get(name) ?? []).map((l) => l.trim()).filter((l) => l.length > 0);
  const stripBullet = (l: string): string => l.replace(/^-\s*/, '').trim();
  return {
    whatThisIs: grab('what this is').join(' '),
    files: grab('files').map(stripBullet),
    builtSoFar: grab('built so far').map(stripBullet),
    recapLine: grab('recap line').join(' '),
  };
}

/** Writes a project's metadata file atomically. */
export function saveProjectMeta(meta: ProjectMeta): void {
  const target = path.join(projectsDir(), meta.slug, metaFileName);
  atomicWriteFileSync(target, JSON.stringify(meta, null, 2) + '\n');
}

const metaKeys = ['slug', 'prettyName', 'scaffoldId', 'themeId', 'createdAt', 'lastOpenedAt'] as const;

function loadMeta(slug: string): ProjectMeta | null {
  const metaPath = path.join(projectsDir(), slug, metaFileName);
  let raw: string;
  try {
    raw = fs.readFileSync(metaPath, 'utf8');
  } catch {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  for (const key of metaKeys) {
    const value = record[key];
    if (typeof value !== 'string' || value.length === 0) return null;
  }
  return {
    slug, // the directory name is the truth for the slug
    prettyName: record.prettyName as string,
    scaffoldId: record.scaffoldId as string,
    themeId: record.themeId as string,
    createdAt: record.createdAt as string,
    lastOpenedAt: record.lastOpenedAt as string,
  };
}

function makeContext(meta: ProjectMeta): ProjectContext {
  const dir = path.join(projectsDir(), meta.slug);

  const listKidFiles = (): { relPath: string; bytes: number }[] => walkKidFiles(dir);

  const readFile = (relPath: string): string | null => {
    const target = resolveInside(dir, relPath);
    if (target === null) return null;
    if (hasDotSegment(relPath)) return null;
    try {
      if (!fs.statSync(target).isFile()) return null;
      return fs.readFileSync(target, 'utf8');
    } catch {
      return null;
    }
  };

  const writeFile = (relPath: string, content: string): void => {
    const target = resolveInside(dir, relPath);
    if (target === null) throw new Error(outsideProjectMessage);
    if (hasDotSegment(relPath) || isVendorFile(relPath)) throw new Error(specialNameMessage);
    if (Buffer.byteLength(content, 'utf8') > maxKidFileBytes) throw new Error(tooLargeMessage);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  };

  const readTermiMd = (): string => {
    try {
      return fs.readFileSync(path.join(dir, notesFileName), 'utf8');
    } catch {
      return renderTermiMd(meta.prettyName, {
        whatThisIs: '',
        files: listKidFiles().map((f) => f.relPath),
        builtSoFar: [],
        recapLine: '',
      });
    }
  };

  const updateTermiMd = (fields: {
    whatThisIs?: string;
    builtSoFar?: string[];
    recapLine?: string;
  }): void => {
    const current = parseTermiMd(readTermiMd());
    if (current.files.length === 0) {
      current.files = listKidFiles().map((f) => f.relPath);
    }
    if (fields.whatThisIs !== undefined) current.whatThisIs = fields.whatThisIs;
    if (fields.builtSoFar !== undefined) {
      for (const item of fields.builtSoFar) {
        const clean = sanitizeLine(item);
        if (clean.length > 0 && !current.builtSoFar.includes(clean)) {
          current.builtSoFar.push(clean);
        }
      }
    }
    if (fields.recapLine !== undefined) current.recapLine = fields.recapLine;
    atomicWriteFileSync(path.join(dir, notesFileName), renderTermiMd(meta.prettyName, current));
  };

  const touch = (): void => {
    meta.lastOpenedAt = new Date().toISOString();
    saveProjectMeta(meta);
  };

  return { meta, dir, listKidFiles, readFile, writeFile, readTermiMd, updateTermiMd, touch };
}

/** Opens a project by slug. Returns null when it is missing or broken. */
export function openProject(slug: string): ProjectContext | null {
  if (typeof slug !== 'string' || slug.length === 0) return null;
  if (slug.includes('/') || slug.includes('\\') || slug.startsWith('.')) return null;
  const meta = loadMeta(slug);
  if (meta === null) return null;
  return makeContext(meta);
}

/** All projects with valid metadata, most recently opened first. */
export function listProjects(): ProjectMeta[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(projectsDir(), { withFileTypes: true });
  } catch {
    return [];
  }
  const metas: ProjectMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const meta = loadMeta(entry.name);
    if (meta !== null) metas.push(meta);
  }
  metas.sort((a, b) => {
    if (a.lastOpenedAt !== b.lastOpenedAt) {
      return a.lastOpenedAt < b.lastOpenedAt ? 1 : -1;
    }
    return a.slug.localeCompare(b.slug);
  });
  return metas;
}
