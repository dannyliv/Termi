import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../src/projects/create.js';
import { createSnapshotStore } from '../src/projects/snapshots.js';
import type { ProjectContext } from '../src/projects/store.js';
import type { SnapshotStore } from '../src/types.js';
import { snapshotsDir } from '../src/config/paths.js';

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-snap-'));
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

function setup(): { project: ProjectContext; store: SnapshotStore } {
  const { project } = createProject('games', 'space-rocks', 'Snap Game');
  return { project, store: createSnapshotStore(project) };
}

function manifestCount(slug: string): number {
  const dir = path.join(snapshotsDir(), slug, 'manifests');
  try {
    return fs.readdirSync(dir).filter((n) => n.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

function blobNames(slug: string): string[] {
  const dir = path.join(snapshotsDir(), slug, 'blobs');
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

describe('beginTurn', () => {
  it('snapshots once and skips when nothing changed', () => {
    const { project, store } = setup();
    store.beginTurn();
    expect(manifestCount(project.meta.slug)).toBe(1);
    store.beginTurn();
    store.beginTurn();
    expect(manifestCount(project.meta.slug)).toBe(1);
  });

  it('adds a manifest when files changed', () => {
    const { project, store } = setup();
    store.beginTurn();
    project.writeFile('game.js', '// version two');
    store.beginTurn();
    expect(manifestCount(project.meta.slug)).toBe(2);
  });
});

describe('undo and redo', () => {
  it('undo restores previous content and deletes new files', () => {
    const { project, store } = setup();
    const original = project.readFile('game.js');
    expect(original).not.toBeNull();

    store.beginTurn();
    project.writeFile('game.js', '// changed by turn');
    project.writeFile('extra.js', 'brand new file');

    expect(store.undo()).toBe(true);
    expect(project.readFile('game.js')).toBe(original);
    expect(project.readFile('extra.js')).toBeNull();
    expect(fs.existsSync(path.join(project.dir, 'extra.js'))).toBe(false);
  });

  it('redo brings the change back', () => {
    const { project, store } = setup();
    store.beginTurn();
    project.writeFile('game.js', '// changed by turn');
    project.writeFile('extra.js', 'brand new file');
    expect(store.undo()).toBe(true);
    expect(store.redo()).toBe(true);
    expect(project.readFile('game.js')).toBe('// changed by turn');
    expect(project.readFile('extra.js')).toBe('brand new file');
  });

  it('returns false when there is nothing to undo or redo', () => {
    const { store } = setup();
    expect(store.undo()).toBe(false);
    store.beginTurn();
    expect(store.undo()).toBe(false);
    expect(store.redo()).toBe(false);
  });

  it('supports stepping back through several turns', () => {
    const { project, store } = setup();
    const original = project.readFile('game.js');
    store.beginTurn();
    project.writeFile('game.js', '// v2');
    store.beginTurn();
    project.writeFile('game.js', '// v3');
    expect(store.undo()).toBe(true);
    expect(project.readFile('game.js')).toBe('// v2');
    expect(store.undo()).toBe(true);
    expect(project.readFile('game.js')).toBe(original);
    expect(store.redo()).toBe(true);
    expect(project.readFile('game.js')).toBe('// v2');
  });

  it('a new write after undo truncates the redo branch', () => {
    const { project, store } = setup();
    store.beginTurn();
    project.writeFile('game.js', '// v2');
    expect(store.undo()).toBe(true);

    project.writeFile('game.js', '// fresh path');
    store.beginTurn();
    expect(store.redo()).toBe(false);
    expect(project.readFile('game.js')).toBe('// fresh path');
  });
});

describe('prune and blob GC', () => {
  it('keeps the last 50 manifests and drops orphaned blobs', () => {
    const { project, store } = setup();
    const versionContent = (i: number): string => `// version ${i}`;
    for (let i = 1; i <= 55; i += 1) {
      project.writeFile('game.js', versionContent(i));
      store.beginTurn();
    }
    const slug = project.meta.slug;
    expect(manifestCount(slug)).toBe(50);

    const nums = fs
      .readdirSync(path.join(snapshotsDir(), slug, 'manifests'))
      .map((n) => Number(n.replace('.json', '')))
      .sort((a, b) => a - b);
    expect(nums[0]).toBe(6);
    expect(nums[nums.length - 1]).toBe(55);

    const blobs = blobNames(slug);
    const shaOf = (text: string): string =>
      crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
    // Pruned versions 1-5 are gone, kept versions remain.
    expect(blobs).not.toContain(shaOf(versionContent(1)));
    expect(blobs).not.toContain(shaOf(versionContent(5)));
    expect(blobs).toContain(shaOf(versionContent(6)));
    expect(blobs).toContain(shaOf(versionContent(55)));
  });

  it('keeps blobs still referenced by any manifest', () => {
    const { project, store } = setup();
    const steady = 'const steady = true;';
    project.writeFile('steady.js', steady);
    for (let i = 1; i <= 55; i += 1) {
      project.writeFile('game.js', `// spin ${i}`);
      store.beginTurn();
    }
    const steadySha = crypto
      .createHash('sha256')
      .update(Buffer.from(steady, 'utf8'))
      .digest('hex');
    expect(blobNames(project.meta.slug)).toContain(steadySha);
    // And the steady file still restores after an undo.
    expect(store.undo()).toBe(true);
    expect(project.readFile('steady.js')).toBe(steady);
  });
});

describe('exclusions', () => {
  it('never captures or restores TERMI.md or metadata', () => {
    const { project, store } = setup();
    store.beginTurn();
    project.writeFile('game.js', '// v2');
    project.updateTermiMd({ recapLine: 'We changed the game.' });
    expect(store.undo()).toBe(true);
    // Notes keep the newer recap even after code undo.
    expect(project.readTermiMd()).toContain('We changed the game.');
    expect(fs.existsSync(path.join(project.dir, '.termi.json'))).toBe(true);
  });
});
