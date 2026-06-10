import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('is-unicode-supported', () => ({ default: vi.fn(() => true) }));

import chalk from 'chalk';
import isUnicodeSupported from 'is-unicode-supported';
import {
  colorsOk,
  glyph,
  glyphNames,
  gradientBlock,
  gradientLine,
  PALETTE,
  resetUnicodeCache,
  unicodeOk,
} from '../src/ui/theme.js';

const savedAscii = process.env['TERMI_ASCII'];
const savedLevel = chalk.level;

beforeEach(() => {
  delete process.env['TERMI_ASCII'];
  resetUnicodeCache();
  vi.mocked(isUnicodeSupported).mockClear();
});

afterEach(() => {
  if (savedAscii === undefined) delete process.env['TERMI_ASCII'];
  else process.env['TERMI_ASCII'] = savedAscii;
  chalk.level = savedLevel;
  resetUnicodeCache();
});

describe('unicodeOk', () => {
  it('caches the terminal detection', () => {
    expect(unicodeOk()).toBe(true);
    expect(unicodeOk()).toBe(true);
    expect(vi.mocked(isUnicodeSupported)).toHaveBeenCalledTimes(1);
  });

  it('re-detects after the cache reset hook', () => {
    unicodeOk();
    resetUnicodeCache();
    unicodeOk();
    expect(vi.mocked(isUnicodeSupported)).toHaveBeenCalledTimes(2);
  });

  it('honors TERMI_ASCII=1 without touching detection', () => {
    process.env['TERMI_ASCII'] = '1';
    expect(unicodeOk()).toBe(false);
    expect(vi.mocked(isUnicodeSupported)).not.toHaveBeenCalled();
  });

  it('honors TERMI_ASCII=0 as a force-on override', () => {
    process.env['TERMI_ASCII'] = '0';
    expect(unicodeOk()).toBe(true);
    expect(vi.mocked(isUnicodeSupported)).not.toHaveBeenCalled();
  });
});

describe('glyph', () => {
  it('returns printable ASCII for every name when TERMI_ASCII=1', () => {
    process.env['TERMI_ASCII'] = '1';
    for (const name of glyphNames) {
      expect(glyph(name), name).toMatch(/^[\x20-\x7E]+$/);
    }
  });

  it('returns non-ASCII symbols when unicode is on', () => {
    process.env['TERMI_ASCII'] = '0';
    expect(glyph('sparkles')).toBe('✨');
    expect(glyph('robot')).not.toMatch(/^[\x20-\x7E]+$/);
  });

  it('covers the full required glyph list', () => {
    const required = [
      'sparkles',
      'robot',
      'rocket',
      'star',
      'heart',
      'check',
      'cross',
      'paint',
      'music',
      'paw',
      'book',
      'question',
      'globe',
      'speech',
      'party',
      'lock',
      'key',
      'bulb',
      'wrench',
      'zap',
    ];
    expect([...glyphNames].sort()).toEqual([...required].sort());
  });
});

describe('colors and gradients', () => {
  it('reports colors based on chalk level', () => {
    chalk.level = 0;
    expect(colorsOk()).toBe(false);
    chalk.level = 3;
    expect(colorsOk()).toBe(true);
  });

  it('falls back to plain text when colors are off', () => {
    chalk.level = 0;
    expect(gradientLine('Termi')).toBe('Termi');
    expect(gradientBlock('a\nb')).toBe('a\nb');
  });

  it('emits ANSI when colors are on', () => {
    chalk.level = 3;
    expect(gradientLine('Termi')).toContain('\u001b[');
  });

  it('uses the teal to purple to orange palette', () => {
    expect(PALETTE.teal).toMatch(/^#[0-9a-f]{6}$/);
    expect(PALETTE.purple).toMatch(/^#[0-9a-f]{6}$/);
    expect(PALETTE.orange).toMatch(/^#[0-9a-f]{6}$/);
  });
});
