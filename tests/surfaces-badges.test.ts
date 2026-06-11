import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  awardBadge,
  badgesFilePath,
  loadBadges,
  markBadge,
  recapFromTermiMd,
} from '../src/surfaces/home.js';

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-badges-'));
  for (const key of ['TERMI_HOME', 'TERMI_PROJECTS_DIR', 'TERMI_KEYRING', 'TERMI_FAST_TEXT']) {
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

describe('badge store', () => {
  it('starts empty', () => {
    expect(loadBadges()).toEqual([]);
  });

  it('marks a badge once and only once', () => {
    expect(markBadge('first-project')).toBe(true);
    expect(markBadge('first-project')).toBe(false);
    expect(loadBadges()).toEqual(['first-project']);
  });

  it('rejects ids that are not real badges', () => {
    expect(markBadge('not-a-badge')).toBe(false);
    expect(loadBadges()).toEqual([]);
  });

  it('keeps earn order and persists to badges.json', () => {
    markBadge('first-project');
    markBadge('first-change');
    expect(loadBadges()).toEqual(['first-project', 'first-change']);
    const raw = JSON.parse(fs.readFileSync(badgesFilePath(), 'utf8')) as { earned: string[] };
    expect(raw.earned).toEqual(['first-project', 'first-change']);
  });

  it('survives a broken badges file', () => {
    fs.mkdirSync(path.dirname(badgesFilePath()), { recursive: true });
    fs.writeFileSync(badgesFilePath(), 'not json at all');
    expect(loadBadges()).toEqual([]);
    expect(markBadge('remixer')).toBe(true);
    expect(loadBadges()).toEqual(['remixer']);
  });
});

describe('awardBadge', () => {
  it('celebrates the first earn and stays quiet after', async () => {
    const lines: string[] = [];
    const first = await awardBadge('bug-squasher', (text) => lines.push(text));
    expect(first).toBe(true);
    expect(lines.join('\n')).toContain('Bug Squasher');

    const again: string[] = [];
    const second = await awardBadge('bug-squasher', (text) => again.push(text));
    expect(second).toBe(false);
    expect(again).toEqual([]);
  });
});

describe('recapFromTermiMd', () => {
  it('reads the "## Recap line" section the project store writes', () => {
    const text = [
      '# Sky Dash',
      '',
      '## What this is',
      'A dodging game.',
      '',
      '## Recap line',
      'We added a boss bat.',
      '',
    ].join('\n');
    expect(recapFromTermiMd(text)).toBe('We added a boss bat.');
  });

  it('reads an inline "Recap:" line', () => {
    expect(recapFromTermiMd('Recap: We painted the sky.')).toBe('We painted the sky.');
    expect(recapFromTermiMd('- recap: We made a pet.')).toBe('We made a pet.');
    expect(recapFromTermiMd('**Recap line:** We fixed a bug.')).toBe('We fixed a bug.');
  });

  it('returns null when there is no recap', () => {
    expect(recapFromTermiMd('')).toBeNull();
    expect(recapFromTermiMd('# Notes\nNothing here yet.')).toBeNull();
  });

  it('skips an empty recap section', () => {
    expect(recapFromTermiMd('## Recap line\n\n# Next section')).toBeNull();
  });
});
