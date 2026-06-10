import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import chalk from 'chalk';
import { bannerRenderCount, renderBanner, TAGLINE } from '../src/ui/banner.js';
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

describe('renderBanner', () => {
  it('degrades to plain text in ASCII mode', () => {
    process.env['TERMI_ASCII'] = '1';
    chalk.level = 0;
    const banner = renderBanner();
    expect(banner).toContain('Termi');
    expect(banner).toContain(TAGLINE);
    expect(banner.split('\n').length).toBe(2);
  });

  it('degrades to plain text when colors are off', () => {
    process.env['TERMI_ASCII'] = '0';
    chalk.level = 0;
    const banner = renderBanner();
    expect(banner).toBe(`Termi\n${TAGLINE}`);
  });

  it('renders multi-line figlet art in full mode', () => {
    process.env['TERMI_ASCII'] = '0';
    chalk.level = 3;
    const banner = renderBanner();
    expect(banner.split('\n').length).toBeGreaterThan(4);
    expect(banner).toContain(TAGLINE);
    expect(banner).toContain('\u001b[');
  });

  it('caches the figlet rendering across calls', () => {
    process.env['TERMI_ASCII'] = '0';
    chalk.level = 3;
    renderBanner();
    const after = bannerRenderCount();
    renderBanner();
    renderBanner();
    expect(bannerRenderCount()).toBe(after);
    expect(after).toBeLessThanOrEqual(1);
  });

  it('keeps the tagline kid-friendly and dash-free', () => {
    expect(DASH_RE.test(TAGLINE)).toBe(false);
    expect(TAGLINE.split(/\s+/).length).toBeLessThan(15);
  });
});
