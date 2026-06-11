import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject, slugifyName } from '../src/projects/create.js';
import { openProject } from '../src/projects/store.js';
import { projectsDir } from '../src/config/paths.js';
import { scaffolds } from '../src/projects/scaffolds/index.js';

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-create-'));
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

describe('slugifyName', () => {
  it('lowercases and turns spaces into dashes', () => {
    expect(slugifyName('My Cool Game').slug).toBe('my-cool-game');
  });

  it('strips emoji', () => {
    expect(slugifyName('🚀 Rocket Run 🚀').slug).toBe('rocket-run');
  });

  it('strips diacritics from unicode names', () => {
    expect(slugifyName('Café Mañana').slug).toBe('cafe-manana');
  });

  it('collapses repeated separators', () => {
    expect(slugifyName('a  --  b!!c').slug).toBe('a-b-c');
  });

  it('caps the slug at 40 characters', () => {
    const { slug } = slugifyName('x'.repeat(80));
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug).toBe('x'.repeat(40));
  });

  it('falls back to my-project for empty input', () => {
    expect(slugifyName('').slug).toBe('my-project');
    expect(slugifyName('🎮🎮🎮').slug).toBe('my-project');
    expect(slugifyName('---').slug).toBe('my-project');
  });

  it('blocks Windows reserved names', () => {
    expect(slugifyName('CON').slug).toBe('con-app');
    expect(slugifyName('aux').slug).toBe('aux-app');
    expect(slugifyName('Com3!').slug).toBe('com3-app');
    expect(slugifyName('LPT9').slug).toBe('lpt9-app');
    expect(slugifyName('com10').slug).toBe('com10');
  });

  it('reports collisions and finds a free numbered slug', () => {
    fs.mkdirSync(path.join(projectsDir(), 'castle'), { recursive: true });
    const second = slugifyName('Castle');
    expect(second.collision).toBe(true);
    expect(second.slug).toBe('castle-2');
    fs.mkdirSync(path.join(projectsDir(), 'castle-2'), { recursive: true });
    const third = slugifyName('Castle');
    expect(third.collision).toBe(true);
    expect(third.slug).toBe('castle-3');
  });

  it('is collision free when no folder exists', () => {
    const result = slugifyName('Brand New');
    expect(result.collision).toBe(false);
    expect(result.slug).toBe('brand-new');
  });
});

describe('createProject for every scaffold', () => {
  for (const scaffold of scaffolds) {
    it(`builds a working ${scaffold.id} project`, () => {
      const theme = scaffold.themes[0];
      expect(theme).toBeDefined();
      if (!theme) return;
      const prettyName = `Test ${scaffold.label}`;
      const { project, starterPrompts } = createProject(scaffold.id, theme.id, prettyName);

      // Kid files from the scaffold are on disk with content.
      const expected = scaffold.files(theme, prettyName);
      for (const [relPath, content] of Object.entries(expected)) {
        const onDisk = fs.readFileSync(path.join(project.dir, relPath), 'utf8');
        expect(onDisk).toBe(content);
      }

      // TERMI.md follows the template and stays small.
      const notes = fs.readFileSync(path.join(project.dir, 'TERMI.md'), 'utf8');
      expect(notes.startsWith('# ')).toBe(true);
      for (const heading of ['## What this is', '## Files', '## Built so far', '## Recap line']) {
        expect(notes).toContain(heading);
      }
      expect(notes.split('\n').length).toBeLessThanOrEqual(60);

      // Metadata is valid and matches.
      const meta = JSON.parse(
        fs.readFileSync(path.join(project.dir, '.termi.json'), 'utf8'),
      ) as Record<string, string>;
      expect(meta.slug).toBe(project.meta.slug);
      expect(meta.prettyName).toBe(prettyName);
      expect(meta.scaffoldId).toBe(scaffold.id);
      expect(meta.themeId).toBe(theme.id);
      expect(typeof meta.createdAt).toBe('string');
      expect(typeof meta.lastOpenedAt).toBe('string');

      // Five starter prompts, all real strings.
      expect(starterPrompts).toHaveLength(5);
      for (const prompt of starterPrompts) {
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
      }

      // Kid files exclude TERMI.md and metadata, and stay within the cap.
      const kidFiles = project.listKidFiles().map((f) => f.relPath);
      expect(kidFiles).not.toContain('TERMI.md');
      expect(kidFiles).not.toContain('.termi.json');
      expect(kidFiles.length).toBeLessThanOrEqual(8);

      // The project reopens cleanly.
      expect(openProject(project.meta.slug)).not.toBeNull();
    });
  }

  it('writes the vendored engine for biggames but hides it from kid files', () => {
    const scaffold = scaffolds.find((s) => s.id === 'biggames');
    expect(scaffold).toBeDefined();
    if (!scaffold) return;
    const theme = scaffold.themes[0];
    if (!theme) return;
    const { project } = createProject('biggames', theme.id, 'Vendor Check');
    const enginePath = path.join(project.dir, 'kaplay.mjs');
    expect(fs.existsSync(enginePath)).toBe(true);
    expect(fs.statSync(enginePath).size).toBeGreaterThan(0);
    expect(project.listKidFiles().map((f) => f.relPath)).not.toContain('kaplay.mjs');
  });

  it('keeps a scaffold-shipped TERMI.md instead of generating one', () => {
    const scaffold = scaffolds.find((s) => s.id === 'stories');
    expect(scaffold).toBeDefined();
    if (!scaffold) return;
    const theme = scaffold.themes[0];
    if (!theme) return;
    const shipped = scaffold.files(theme, 'Story Check')['TERMI.md'];
    expect(shipped).toBeDefined();
    const { project } = createProject('stories', theme.id, 'Story Check');
    expect(fs.readFileSync(path.join(project.dir, 'TERMI.md'), 'utf8')).toBe(shipped);
  });

  it('resolves name collisions with a numbered slug', () => {
    const first = createProject('games', 'space-rocks', 'Same Name');
    const second = createProject('games', 'space-rocks', 'Same Name');
    expect(first.project.meta.slug).toBe('same-name');
    expect(second.project.meta.slug).toBe('same-name-2');
    expect(fs.existsSync(first.project.dir)).toBe(true);
    expect(fs.existsSync(second.project.dir)).toBe(true);
  });

  it('uses a friendly default for blank names', () => {
    const { project } = createProject('games', 'space-rocks', '   ');
    expect(project.meta.prettyName).toBe('My Project');
    expect(project.meta.slug).toBe('my-project');
  });

  it('throws kid-readable errors for unknown ids', () => {
    expect(() => createProject('nope', 'space-rocks', 'X')).toThrow(/project type/);
    expect(() => createProject('games', 'nope', 'X')).toThrow(/style/);
  });
});
