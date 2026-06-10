import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  heartbeatLine,
  heartbeatLines,
  MASCOT_ASCII,
  MASCOT_UNICODE,
  mascot,
  oneLiners,
  pickOneLiner,
} from '../src/ui/mascot.js';
import { resetUnicodeCache } from '../src/ui/theme.js';
import { collectStrings, DASH_RE } from './ui-fk.js';

const EXPRESSIONS = [
  'happy',
  'thinking',
  'building',
  'celebrating',
  'oops',
  'gentleNo',
] as const;

const savedAscii = process.env['TERMI_ASCII'];

beforeEach(() => {
  resetUnicodeCache();
});

afterEach(() => {
  if (savedAscii === undefined) delete process.env['TERMI_ASCII'];
  else process.env['TERMI_ASCII'] = savedAscii;
  resetUnicodeCache();
});

describe('mascot faces', () => {
  it('defines both art sets for every expression', () => {
    for (const expression of EXPRESSIONS) {
      expect(MASCOT_ASCII[expression].length).toBeGreaterThan(0);
      expect(MASCOT_UNICODE[expression].length).toBeGreaterThan(0);
    }
  });

  it('keeps every face within 6 lines and 30 columns', () => {
    for (const set of [MASCOT_ASCII, MASCOT_UNICODE]) {
      for (const expression of EXPRESSIONS) {
        const lines = set[expression];
        expect(lines.length, expression).toBeLessThanOrEqual(6);
        for (const line of lines) {
          expect([...line].length, `${expression}: "${line}"`).toBeLessThanOrEqual(30);
        }
      }
    }
  });

  it('uses only printable ASCII in the ASCII set', () => {
    for (const expression of EXPRESSIONS) {
      for (const line of MASCOT_ASCII[expression]) {
        expect(line, `${expression}: "${line}"`).toMatch(/^[\x20-\x7E]*$/);
      }
    }
  });

  it('contains no banned dash characters in either art set', () => {
    for (const set of [MASCOT_ASCII, MASCOT_UNICODE]) {
      for (const expression of EXPRESSIONS) {
        for (const line of set[expression]) {
          expect(DASH_RE.test(line), `${expression}: "${line}"`).toBe(false);
        }
      }
    }
  });

  it('selects the ASCII set when TERMI_ASCII=1', () => {
    process.env['TERMI_ASCII'] = '1';
    expect(mascot('happy')).toBe(MASCOT_ASCII.happy.join('\n'));
    process.env['TERMI_ASCII'] = '0';
    expect(mascot('happy')).toBe(MASCOT_UNICODE.happy.join('\n'));
  });
});

describe('one-liners', () => {
  it('has at least 25 quips across all contexts', () => {
    const all = collectStrings(oneLiners);
    expect(all.length).toBeGreaterThanOrEqual(25);
  });

  it('covers all nine project categories', () => {
    const categories = [
      'games',
      'biggames',
      'art',
      'music',
      'pets',
      'stories',
      'quizzes',
      'websites',
      'characters',
    ] as const;
    for (const category of categories) {
      expect(oneLiners.newProject[category].length, category).toBeGreaterThanOrEqual(2);
    }
  });

  it('contains no banned dash characters', () => {
    for (const { path, text } of collectStrings(oneLiners)) {
      expect(DASH_RE.test(text), `${path}: "${text}"`).toBe(false);
    }
  });

  it('picks from the right pool', () => {
    expect(oneLiners.newProject.art).toContain(pickOneLiner('newProject', 'art'));
    expect(oneLiners.bugFixed).toContain(pickOneLiner('bugFixed'));
  });
});

describe('heartbeat lines', () => {
  it('changes pools past 20 and 45 seconds', () => {
    const early = heartbeatLines(5);
    const mid = heartbeatLines(25);
    const late = heartbeatLines(50);
    expect(mid).not.toEqual(early);
    expect(late).not.toEqual(mid);
    expect(late).not.toEqual(early);
  });

  it('rotates lines as time passes', () => {
    const first = heartbeatLine(0);
    const second = heartbeatLine(3);
    expect(first).not.toBe(second);
  });

  it('always returns a non-empty line', () => {
    for (const seconds of [0, 10, 21, 44, 46, 600]) {
      expect(heartbeatLine(seconds).length).toBeGreaterThan(0);
    }
  });
});
