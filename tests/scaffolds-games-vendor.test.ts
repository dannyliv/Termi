/**
 * Vendored engine tests for the Big Games scaffold.
 * Checks the local KAPLAY bundle wiring: no network, no real home dir.
 */

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ThemeConfig } from '../src/types.js';
import bigGamesScaffold from '../src/projects/scaffolds/biggames.js';

const vendorDir = new URL('../src/projects/scaffolds/vendor/', import.meta.url);

describe('biggames vendored engine', () => {
  it('ships kaplay.mjs as the only vendor file', () => {
    const vendor = bigGamesScaffold.vendorFiles;
    expect(vendor).toBeDefined();
    expect(Object.keys(vendor!)).toEqual(['kaplay.mjs']);
  });

  it('vendor bundle looks like a real ESM engine build', () => {
    const source = bigGamesScaffold.vendorFiles!['kaplay.mjs'] ?? '';
    expect(source.length).toBeGreaterThan(100_000);
    expect(source).toContain('export');
    expect(source).toContain('default');
  });

  it('returns identical content on repeat reads (cached)', () => {
    const first = bigGamesScaffold.vendorFiles!['kaplay.mjs'];
    const second = bigGamesScaffold.vendorFiles!['kaplay.mjs'];
    expect(first).toBe(second);
  });

  it('game.js imports the engine locally, never from a URL', () => {
    for (const theme of bigGamesScaffold.themes) {
      const js = bigGamesScaffold.files(theme, 'Vendor Check')['game.js'] ?? '';
      expect(js).toContain('import kaplay from "./kaplay.mjs"');
      expect(js).not.toContain('http://');
      expect(js).not.toContain('https://');
    }
  });

  it('index.html loads game.js as a module so the import works', () => {
    const theme = bigGamesScaffold.themes[0] as ThemeConfig;
    const html = bigGamesScaffold.files(theme, 'Vendor Check')['index.html'] ?? '';
    expect(html).toContain('<script type="module" src="game.js">');
  });

  it('keeps the engine license next to the vendored file', () => {
    const licensePath = new URL('KAPLAY-LICENSE.txt', vendorDir);
    expect(existsSync(licensePath)).toBe(true);
    const license = readFileSync(licensePath, 'utf8');
    expect(license).toContain('KAPLAY');
    expect(license.length).toBeGreaterThan(200);
  });

  it('vendored file matches the on-disk engine byte for byte', () => {
    const onDisk = readFileSync(new URL('kaplay.mjs', vendorDir), 'utf8');
    expect(bigGamesScaffold.vendorFiles!['kaplay.mjs']).toBe(onDisk);
  });

  it('each platformer game.js defines two levels', () => {
    for (const theme of bigGamesScaffold.themes) {
      const js = bigGamesScaffold.files(theme, 'Vendor Check')['game.js'] ?? '';
      expect(js).toContain('const LEVELS = [');
      // Both level grids include ground, a collectible, a hazard, and a goal.
      expect((js.match(/"={5,}[^"]*"/g) ?? []).length).toBeGreaterThanOrEqual(2);
      expect(js).toContain('"hazard"');
      expect(js).toContain('"coin"');
      expect(js).toContain('"flag"');
    }
  });
});
