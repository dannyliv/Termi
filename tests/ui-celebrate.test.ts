import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import chalk from 'chalk';
import { BADGES, celebrate, confetti, renderBadgeShelf } from '../src/ui/celebrate.js';
import { resetUnicodeCache } from '../src/ui/theme.js';
import { DASH_RE } from './ui-fk.js';

const savedAscii = process.env['TERMI_ASCII'];
const savedLevel = chalk.level;

beforeEach(() => {
  resetUnicodeCache();
});

afterEach(() => {
  if (savedAscii === undefined) delete process.env['TERMI_ASCII'];
  else process.env['TERMI_ASCII'] = savedAscii;
  chalk.level = savedLevel;
  resetUnicodeCache();
});

describe('badges', () => {
  it('matches the planned badge id list exactly', () => {
    expect(BADGES.map((badge) => badge.id)).toEqual([
      'first-project',
      'first-change',
      'game-shipped',
      'bug-squasher',
      'remixer',
      'five-projects',
    ]);
  });

  it('gives every badge a label, emoji, and hint', () => {
    for (const badge of BADGES) {
      expect(badge.label.length, badge.id).toBeGreaterThan(0);
      expect(badge.emoji.length, badge.id).toBeGreaterThan(0);
      expect(badge.hint.length, badge.id).toBeGreaterThan(0);
      expect(DASH_RE.test(badge.hint), badge.id).toBe(false);
    }
  });
});

describe('renderBadgeShelf', () => {
  it('shows earned badges and hints for locked ones', () => {
    process.env['TERMI_ASCII'] = '1';
    chalk.level = 0;
    const shelf = renderBadgeShelf(['first-project']);
    expect(shelf).toContain('First Project');
    expect(shelf).toContain('You earned 1 of 6 badges.');
    expect(shelf).toContain('Make five projects.');
  });

  it('counts only known badge ids', () => {
    process.env['TERMI_ASCII'] = '1';
    chalk.level = 0;
    const shelf = renderBadgeShelf(['mystery-badge']);
    expect(shelf).toContain('You earned 0 of 6 badges.');
  });
});

describe('confetti', () => {
  it('writes one line per frame with no real delay', async () => {
    process.env['TERMI_ASCII'] = '1';
    const chunks: string[] = [];
    await confetti(4, {
      delayMs: 0,
      width: 12,
      write: (chunk) => chunks.push(chunk),
      rng: () => 0.1,
    });
    expect(chunks.length).toBe(4);
    for (const chunk of chunks) {
      expect(chunk.endsWith('\n')).toBe(true);
      expect(chunk).toMatch(/^[\x20-\x7E]*\n$/);
    }
  });

  it('uses unicode pieces when unicode is on', async () => {
    process.env['TERMI_ASCII'] = '0';
    const chunks: string[] = [];
    await confetti(1, {
      delayMs: 0,
      width: 8,
      write: (chunk) => chunks.push(chunk),
      rng: () => 0.0,
    });
    expect(chunks[0]).toContain('✨');
  });
});

describe('celebrate', () => {
  it('boxes the message with the celebrating mascot', () => {
    process.env['TERMI_ASCII'] = '1';
    chalk.level = 0;
    const box = celebrate('You did it!');
    expect(box).toContain('You did it!');
    expect(box).toContain('\\o/');
    for (const line of box.split('\n')) {
      expect(line).toMatch(/^[\x20-\x7E]*$/);
    }
  });
});
