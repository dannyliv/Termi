import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../src/projects/create.js';
import {
  listProjects,
  maxKidFileBytes,
  openProject,
  parseTermiMd,
  saveProjectMeta,
  type ProjectContext,
} from '../src/projects/store.js';
import { projectsDir } from '../src/config/paths.js';

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-store-'));
  for (const key of ['TERMI_HOME', 'TERMI_PROJECTS_DIR', 'TERMI_KEYRING']) {
    savedEnv[key] = process.env[key];
  }
  process.env.TERMI_HOME = path.join(tmpRoot, 'home');
  process.env.TERMI_PROJECTS_DIR = path.join(tmpRoot, 'projects');
  process.env.TERMI_KEYRING = 'file';
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function makeProject(name = 'Store Test'): ProjectContext {
  return createProject('games', 'space-rocks', name).project;
}

describe('openProject', () => {
  it('returns null for missing projects', () => {
    expect(openProject('not-here')).toBeNull();
  });

  it('returns null for broken metadata', () => {
    const dir = path.join(projectsDir(), 'broken');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.termi.json'), 'not json at all');
    expect(openProject('broken')).toBeNull();
  });

  it('rejects sneaky slugs', () => {
    expect(openProject('../escape')).toBeNull();
    expect(openProject('.hidden')).toBeNull();
    expect(openProject('')).toBeNull();
  });
});

describe('file jail', () => {
  it('blocks writes outside the project', () => {
    const p = makeProject();
    expect(() => p.writeFile('../evil.txt', 'x')).toThrow(/outside your project/);
    expect(() => p.writeFile('a/../../evil.txt', 'x')).toThrow(/outside your project/);
    expect(() => p.writeFile(path.join(tmpRoot, 'abs.txt'), 'x')).toThrow(/outside your project/);
    expect(fs.existsSync(path.join(projectsDir(), 'evil.txt'))).toBe(false);
  });

  it('returns null for reads outside the project', () => {
    const p = makeProject();
    fs.writeFileSync(path.join(tmpRoot, 'secret.txt'), 'shh');
    expect(p.readFile('../secret.txt')).toBeNull();
    expect(p.readFile(path.join(tmpRoot, 'secret.txt'))).toBeNull();
    expect(p.readFile('')).toBeNull();
  });

  it('hides dotfiles and blocks special names', () => {
    const p = makeProject();
    expect(p.readFile('.termi.json')).toBeNull();
    expect(() => p.writeFile('.termi.json', '{}')).toThrow(/off limits/);
    expect(() => p.writeFile('kaplay.mjs', 'evil')).toThrow(/off limits/);
  });
});

describe('writeFile', () => {
  it('enforces the 256 KB size cap', () => {
    const p = makeProject();
    expect(() => p.writeFile('big.js', 'x'.repeat(maxKidFileBytes + 1))).toThrow(/too big/);
    p.writeFile('ok.js', 'x'.repeat(maxKidFileBytes));
    expect(p.readFile('ok.js')).toHaveLength(maxKidFileBytes);
  });

  it('creates parent folders inside the project', () => {
    const p = makeProject();
    p.writeFile('levels/two.js', 'level two');
    expect(p.readFile('levels/two.js')).toBe('level two');
    expect(p.listKidFiles().map((f) => f.relPath)).toContain('levels/two.js');
  });
});

describe('listKidFiles', () => {
  it('excludes notes, metadata, dotfiles, and vendor engine files', () => {
    const p = makeProject();
    fs.writeFileSync(path.join(p.dir, 'kaplay.mjs'), 'engine');
    fs.writeFileSync(path.join(p.dir, '.hidden'), 'dot');
    const names = p.listKidFiles().map((f) => f.relPath);
    expect(names).toContain('index.html');
    expect(names).toContain('game.js');
    expect(names).not.toContain('TERMI.md');
    expect(names).not.toContain('.termi.json');
    expect(names).not.toContain('.hidden');
    expect(names).not.toContain('kaplay.mjs');
  });

  it('reports byte sizes', () => {
    const p = makeProject();
    p.writeFile('tiny.js', 'abcde');
    const entry = p.listKidFiles().find((f) => f.relPath === 'tiny.js');
    expect(entry?.bytes).toBe(5);
  });
});

describe('updateTermiMd', () => {
  it('merges fields and keeps existing bullets', () => {
    const p = makeProject();
    const before = parseTermiMd(p.readTermiMd());
    expect(before.builtSoFar.length).toBeGreaterThan(0);
    const firstBullet = before.builtSoFar[0];

    p.updateTermiMd({ builtSoFar: ['Added a shield power up'] });
    p.updateTermiMd({ recapLine: 'We added a shield today.' });
    p.updateTermiMd({ whatThisIs: 'A dodge game with a shield.' });

    const after = parseTermiMd(p.readTermiMd());
    expect(after.builtSoFar).toContain(firstBullet);
    expect(after.builtSoFar).toContain('Added a shield power up');
    expect(after.recapLine).toBe('We added a shield today.');
    expect(after.whatThisIs).toBe('A dodge game with a shield.');
  });

  it('keeps the file at 60 lines, dropping oldest bullets first', () => {
    const p = makeProject();
    const bullets = Array.from({ length: 80 }, (_, i) => `Step number ${i + 1} done`);
    p.updateTermiMd({ builtSoFar: bullets });
    const text = p.readTermiMd();
    expect(text.split('\n').length).toBeLessThanOrEqual(60);
    const parsed = parseTermiMd(text);
    expect(parsed.builtSoFar).toContain('Step number 80 done');
    expect(parsed.builtSoFar).not.toContain('Step number 1 done');
  });

  it('never lets field text inject headings', () => {
    const p = makeProject();
    p.updateTermiMd({
      whatThisIs: 'Nice game.\n## Hacked\n# Sneaky title',
      builtSoFar: ['## Hacked bullet'],
      recapLine: '## Hacked recap\nline two',
    });
    const lines = p.readTermiMd().split('\n');
    expect(lines.some((l) => l.startsWith('## Hacked'))).toBe(false);
    const headings = lines.filter((l) => l.startsWith('#'));
    expect(headings).toEqual([
      '# Store Test',
      '## What this is',
      '## Files',
      '## Built so far',
      '## Recap line',
    ]);
    // The words survive as plain text, just not as headings.
    expect(p.readTermiMd()).toContain('Hacked recap line two');
  });

  it('skips duplicate bullets', () => {
    const p = makeProject();
    p.updateTermiMd({ builtSoFar: ['Made the sky blue'] });
    p.updateTermiMd({ builtSoFar: ['Made the sky blue'] });
    const parsed = parseTermiMd(p.readTermiMd());
    expect(parsed.builtSoFar.filter((b) => b === 'Made the sky blue')).toHaveLength(1);
  });
});

describe('readTermiMd', () => {
  it('returns a valid template even when the file is missing', () => {
    const p = makeProject();
    fs.rmSync(path.join(p.dir, 'TERMI.md'));
    const text = p.readTermiMd();
    for (const heading of ['## What this is', '## Files', '## Built so far', '## Recap line']) {
      expect(text).toContain(heading);
    }
  });
});

describe('listProjects', () => {
  it('sorts most recently opened first and reacts to touch()', () => {
    const older = makeProject('Older One');
    const newer = makeProject('Newer One');
    saveProjectMeta({ ...older.meta, lastOpenedAt: '2026-01-01T00:00:00.000Z' });
    saveProjectMeta({ ...newer.meta, lastOpenedAt: '2026-01-02T00:00:00.000Z' });
    expect(listProjects().map((m) => m.slug)).toEqual(['newer-one', 'older-one']);

    const reopened = openProject('older-one');
    expect(reopened).not.toBeNull();
    reopened?.touch();
    expect(listProjects().map((m) => m.slug)).toEqual(['older-one', 'newer-one']);
    expect(reopened?.meta.lastOpenedAt).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('skips folders with broken or missing metadata', () => {
    makeProject('Good One');
    fs.mkdirSync(path.join(projectsDir(), 'no-meta'), { recursive: true });
    const brokenDir = path.join(projectsDir(), 'bad-meta');
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(path.join(brokenDir, '.termi.json'), '{"slug": 5}');
    expect(listProjects().map((m) => m.slug)).toEqual(['good-one']);
  });
});
