/**
 * Template validity tests for the Games (Sky Dash) and Big Games (platformer)
 * scaffolds. Pure string checks: no network, no keychain, no real home dir.
 */

import { describe, expect, it } from 'vitest';
import type { ScaffoldDef, ThemeConfig } from '../src/types.js';
import gamesScaffold from '../src/projects/scaffolds/games.js';
import bigGamesScaffold from '../src/projects/scaffolds/biggames.js';

const PRETTY = 'Star Catcher';
const DASHES = /[‐‑‒–—―−]/;
const PLACEHOLDERS = ['{{', '}}', '${', 'TODO', 'FIXME', 'XXX'];

const scaffolds: ScaffoldDef[] = [gamesScaffold, bigGamesScaffold];

/** Pulls every src= and href= value out of an HTML string. */
function references(html: string): string[] {
  const out: string[] = [];
  const re = /(?:src|href)\s*=\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] !== undefined) out.push(m[1]);
  }
  return out;
}

/** Counts occurrences of a substring. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function sentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

for (const scaffold of scaffolds) {
  describe(`scaffold ${scaffold.id}`, () => {
    it('has 4 themes with a nonViolent and a nonCompetitive option', () => {
      expect(scaffold.themes).toHaveLength(4);
      expect(scaffold.themes.some((t) => t.nonViolent)).toBe(true);
      expect(scaffold.themes.some((t) => t.nonCompetitive)).toBe(true);
    });

    it('has complete metadata', () => {
      expect(scaffold.id.length).toBeGreaterThan(0);
      expect(scaffold.label.length).toBeGreaterThan(0);
      expect(scaffold.emoji.length).toBeGreaterThan(0);
      expect(scaffold.ageNote.length).toBeGreaterThan(0);
    });

    for (const theme of scaffold.themes) {
      describe(`theme ${theme.id}`, () => {
        const files = scaffold.files(theme, PRETTY);

        it('produces exactly index.html, style.css, game.js', () => {
          expect(Object.keys(files).sort()).toEqual(['game.js', 'index.html', 'style.css']);
        });

        it('theme config is complete', () => {
          expect(theme.label.length).toBeGreaterThan(0);
          expect(theme.emoji.length).toBeGreaterThan(0);
          expect(theme.palette.bg).toMatch(/^#[0-9a-f]{6}$/i);
          expect(theme.palette.fg).toMatch(/^#[0-9a-f]{6}$/i);
          expect(theme.palette.accent).toMatch(/^#[0-9a-f]{6}$/i);
          expect(Object.keys(theme.glyphs).length).toBeGreaterThanOrEqual(3);
          expect(Object.keys(theme.strings).length).toBeGreaterThanOrEqual(8);
          expect(theme.narrativeIntro.length).toBeGreaterThan(0);
        });

        it('contains no external URLs', () => {
          for (const content of Object.values(files)) {
            expect(content).not.toContain('http://');
            expect(content).not.toContain('https://');
          }
        });

        it('contains no unfilled placeholder markers', () => {
          for (const content of Object.values(files)) {
            for (const marker of PLACEHOLDERS) {
              expect(content).not.toContain(marker);
            }
          }
        });

        it('contains no em-dash or en-dash characters', () => {
          for (const content of Object.values(files)) {
            expect(DASHES.test(content)).toBe(false);
          }
          expect(DASHES.test(theme.narrativeIntro)).toBe(false);
          expect(DASHES.test(Object.values(theme.strings).join(' '))).toBe(false);
          expect(DASHES.test(scaffold.ageNote)).toBe(false);
        });

        it('index.html references exactly the produced files', () => {
          const html = files['index.html'] ?? '';
          const refs = references(html).filter((r) => !r.startsWith('#'));
          expect(refs.sort()).toEqual(['game.js', 'style.css']);
        });

        it('index.html is well formed', () => {
          const html = files['index.html'] ?? '';
          expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
          for (const tag of ['html', 'head', 'body', 'main', 'title', 'h1', 'script', 'canvas']) {
            const opens = count(html, `<${tag}`);
            const closes = count(html, `</${tag}>`);
            expect(opens, `<${tag}> open/close mismatch`).toBe(closes);
            expect(opens).toBeGreaterThan(0);
          }
        });

        it('index.html shows the pretty name and includes a canvas', () => {
          const html = files['index.html'] ?? '';
          expect(html).toContain(PRETTY);
          expect(html).toContain('<canvas id="game"');
        });

        it('game.js starts from the THEME const and matches the theme data', () => {
          const js = files['game.js'] ?? '';
          expect(js).toContain('const THEME = ');
          const match = js.match(/const THEME = ([\s\S]*?\n\});/);
          expect(match).not.toBeNull();
          const parsed = JSON.parse(match![1] ?? '');
          expect(parsed.id).toBe(theme.id);
          expect(parsed.palette).toEqual(theme.palette);
          expect(parsed.glyphs).toEqual(theme.glyphs);
          expect(parsed.strings).toEqual(theme.strings);
          expect(parsed.narrative).toBe(theme.narrativeIntro);
        });

        it('game.js has controls, score, win and lose handling, and a restart', () => {
          const js = files['game.js'] ?? '';
          expect(js.toLowerCase()).toContain('score');
          expect(js).toContain('win');
          expect(js).toContain('lose');
          // Arrow keys, WASD, and touch input all appear.
          expect(/arrowleft|"left"/i.test(js)).toBe(true);
          expect(/keysdown\["a"\]|onkeydown\("a"/i.test(js)).toBe(true);
          expect(/touch|onmousepress/i.test(js)).toBe(true);
        });

        it('style.css uses the theme palette', () => {
          const css = files['style.css'] ?? '';
          expect(css).toContain(theme.palette.bg);
          expect(css).toContain(theme.palette.fg);
          expect(css).toContain(theme.palette.accent);
        });

        it('gives 5 kid-style starter prompts', () => {
          const prompts = scaffold.starterPrompts(theme);
          expect(prompts).toHaveLength(5);
          for (const prompt of prompts) {
            expect(prompt.trim().length).toBeGreaterThan(0);
            expect(DASHES.test(prompt)).toBe(false);
          }
        });

        it('kid-facing strings keep sentences under 15 words', () => {
          const texts = [theme.narrativeIntro, scaffold.ageNote, ...Object.values(theme.strings)];
          for (const text of texts) {
            for (const sentence of sentences(text)) {
              const words = sentence.split(/\s+/).filter((w) => w.length > 0);
              expect(words.length, `too long: "${sentence}"`).toBeLessThanOrEqual(15);
            }
          }
        });
      });
    }
  });
}

describe('pretty name handling', () => {
  const tricky = `<Snake> & "Spooky" 'Pals'`;

  for (const scaffold of scaffolds) {
    it(`${scaffold.id}: escapes HTML and keeps game.js valid`, () => {
      const theme = scaffold.themes[0] as ThemeConfig;
      const files = scaffold.files(theme, tricky);
      const html = files['index.html'] ?? '';
      expect(html).not.toContain('<Snake>');
      expect(html).toContain('&lt;Snake&gt;');
      const js = files['game.js'] ?? '';
      expect(js).toContain('const GAME_NAME = ');
    });

    it(`${scaffold.id}: falls back to a friendly name when blank`, () => {
      const theme = scaffold.themes[0] as ThemeConfig;
      const files = scaffold.files(theme, '   ');
      expect(files['index.html']).toContain('My');
    });
  }
});
