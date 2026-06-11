import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cliHelp } from '../src/cli.js';
import { LESSONS } from '../src/learn/lessons.js';
import {
  learnFilePath,
  lessonMenuLabel,
  loadProgress,
  markLessonDone,
} from '../src/learn/runner.js';
import { BARE_WORDS, COMMAND_NAMES, helpText, parseCommand } from '../src/surfaces/commands.js';
import { markBadge } from '../src/surfaces/home.js';
import { BADGES } from '../src/ui/celebrate.js';

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ['TERMI_HOME', 'TERMI_PROJECTS_DIR', 'TERMI_KEYRING', 'TERMI_FAST_TEXT', 'TERMI_ASCII'];

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-learn-'));
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  process.env.TERMI_HOME = path.join(tmpRoot, 'home');
  process.env.TERMI_PROJECTS_DIR = path.join(tmpRoot, 'projects');
  process.env.TERMI_KEYRING = 'file';
  process.env.TERMI_FAST_TEXT = '1';
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

describe('learn progress store', () => {
  it('lives at TERMI_HOME/learn.json', () => {
    expect(learnFilePath()).toBe(path.join(path.join(tmpRoot, 'home'), 'learn.json'));
  });

  it('starts empty', () => {
    expect(loadProgress()).toEqual({ completed: [] });
  });

  it('round-trips finished lessons in order', () => {
    markLessonDone('learn-1');
    markLessonDone('learn-3');
    expect(loadProgress()).toEqual({ completed: ['learn-1', 'learn-3'] });
    const raw = JSON.parse(fs.readFileSync(learnFilePath(), 'utf8')) as { completed: string[] };
    expect(raw.completed).toEqual(['learn-1', 'learn-3']);
  });

  it('does not duplicate a lesson finished twice', () => {
    markLessonDone('learn-2');
    markLessonDone('learn-2');
    expect(loadProgress()).toEqual({ completed: ['learn-2'] });
  });

  it('survives a broken progress file', () => {
    fs.mkdirSync(path.dirname(learnFilePath()), { recursive: true });
    fs.writeFileSync(learnFilePath(), 'not json at all');
    expect(loadProgress()).toEqual({ completed: [] });
    markLessonDone('learn-5');
    expect(loadProgress()).toEqual({ completed: ['learn-5'] });
  });
});

describe('learn badges', () => {
  it('defines learn-1 through learn-6 exactly once each', () => {
    const learnIds = BADGES.filter((badge) => badge.id.startsWith('learn-')).map((b) => b.id);
    expect(learnIds).toEqual(['learn-1', 'learn-2', 'learn-3', 'learn-4', 'learn-5', 'learn-6']);
    expect(new Set(learnIds).size).toBe(6);
  });

  it('gives every learn badge a label, emoji, and hint', () => {
    for (const badge of BADGES.filter((b) => b.id.startsWith('learn-'))) {
      expect(badge.label.length, badge.id).toBeGreaterThan(0);
      expect(badge.emoji.length, badge.id).toBeGreaterThan(0);
      expect(badge.hint.length, badge.id).toBeGreaterThan(0);
    }
  });

  it('has a badge def for every lesson id', () => {
    const badgeIds = new Set(BADGES.map((badge) => badge.id));
    for (const lesson of LESSONS) {
      expect(badgeIds.has(lesson.id), lesson.id).toBe(true);
    }
  });

  it('lets the badge store earn a learn badge once', () => {
    expect(markBadge('learn-4')).toBe(true);
    expect(markBadge('learn-4')).toBe(false);
  });
});

describe('learn menu labels', () => {
  it('adds a done mark only to finished lessons', () => {
    process.env.TERMI_ASCII = '1';
    const lesson = LESSONS[0];
    expect(lesson).toBeDefined();
    if (lesson === undefined) return;
    const open = lessonMenuLabel(lesson, false);
    const done = lessonMenuLabel(lesson, true);
    expect(open).toContain(lesson.title);
    expect(done).toContain(lesson.title);
    expect(done).not.toBe(open);
    expect(done.endsWith('+')).toBe(true);
  });
});

describe('learn command wiring', () => {
  it('knows /learn as a slash command', () => {
    expect((COMMAND_NAMES as readonly string[]).includes('learn')).toBe(true);
    expect(parseCommand('/learn')).toEqual({ kind: 'learn' });
  });

  it('accepts the bare word learn', () => {
    expect((BARE_WORDS as readonly string[]).includes('learn')).toBe(true);
    expect(parseCommand('learn')).toEqual({ kind: 'learn' });
    expect(parseCommand('LEARN')).toEqual({ kind: 'learn' });
  });

  it('leaves learn sentences as chat', () => {
    expect(parseCommand('learn me a magic trick')).toEqual({
      kind: 'chat',
      text: 'learn me a magic trick',
    });
  });

  it('mentions learn in the chat help and the CLI help', () => {
    expect(helpText()).toContain('/learn');
    expect(cliHelp()).toContain('termi learn');
  });
});
