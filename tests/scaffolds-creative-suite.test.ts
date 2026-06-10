/**
 * Invariant and behavior tests for the creative scaffolds:
 * art (Pixel Studio), music (Dance Party), pets (My Pet).
 * Pure functions only: no network, no keychain, no real home dir.
 */

import { describe, expect, it } from 'vitest';
import { artScaffold } from '../src/projects/scaffolds/art.js';
import { musicScaffold } from '../src/projects/scaffolds/music.js';
import { petsScaffold } from '../src/projects/scaffolds/pets.js';
import type { ScaffoldDef, ThemeConfig } from '../src/types.js';

const PRETTY = 'Star Cave';
const KID_FILES = ['index.html', 'style.css', 'game.js'];
const DASHES = new RegExp('[\\u2010\\u2011\\u2012\\u2013\\u2014\\u2015\\u2212]');
const PLACEHOLDERS = /\b(todo|fixme|tbd|placeholder|lorem|your code here|coming soon)\b/i;
const NETWORK_APIS = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection|importScripts)\b/;

const scaffolds: ScaffoldDef[] = [artScaffold, musicScaffold, petsScaffold];

function eachTheme(scaffold: ScaffoldDef): [string, ThemeConfig][] {
  return scaffold.themes.map((t) => [t.id, t]);
}

for (const scaffold of scaffolds) {
  describe(`${scaffold.id} scaffold invariants`, () => {
    it('has the expected shape', () => {
      expect(scaffold.id).toBeTruthy();
      expect(scaffold.label).toBeTruthy();
      expect(scaffold.emoji).toBeTruthy();
      expect(scaffold.ageNote).toBeTruthy();
      expect(scaffold.themes).toHaveLength(2);
      expect(scaffold.vendorFiles).toBeUndefined();
    });

    it.each(eachTheme(scaffold))('theme %s is complete and gentle', (_id, theme) => {
      expect(theme.label).toBeTruthy();
      expect(theme.emoji).toBeTruthy();
      expect(theme.palette.bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.palette.fg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.palette.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.narrativeIntro).toBeTruthy();
      expect(theme.nonViolent).toBe(true);
      expect(theme.nonCompetitive).toBe(true);
      for (const value of Object.values(theme.strings)) {
        expect(value).not.toMatch(DASHES);
      }
      expect(theme.narrativeIntro).not.toMatch(DASHES);
    });

    it.each(eachTheme(scaffold))('theme %s emits exactly the 3 kid files', (_id, theme) => {
      const files = scaffold.files(theme, PRETTY);
      expect(Object.keys(files).sort()).toEqual([...KID_FILES].sort());
      for (const content of Object.values(files)) {
        expect(content.length).toBeGreaterThan(100);
        expect(content.length).toBeLessThan(256 * 1024);
      }
    });

    it.each(eachTheme(scaffold))('theme %s has a THEME const block', (_id, theme) => {
      const files = scaffold.files(theme, PRETTY);
      expect(files['game.js']).toContain('const THEME =');
      expect(files['game.js']).toContain(`"id": "${theme.id}"`);
    });

    it.each(eachTheme(scaffold))('theme %s never touches the network', (_id, theme) => {
      const files = scaffold.files(theme, PRETTY);
      for (const [path, content] of Object.entries(files)) {
        expect(content, `${path} must not hold external URLs`).not.toMatch(/https?:\/\//i);
        expect(content, `${path} must not reference protocol-relative URLs`).not.toMatch(/src="\/\//);
      }
      expect(files['game.js']).not.toMatch(NETWORK_APIS);
      expect(files['index.html']).not.toMatch(/<(img|audio|video|iframe|source)\b/i);
    });

    it.each(eachTheme(scaffold))('theme %s has no placeholders or dashes', (_id, theme) => {
      const files = scaffold.files(theme, PRETTY);
      for (const [path, content] of Object.entries(files)) {
        expect(content, `${path} must be complete`).not.toMatch(PLACEHOLDERS);
        expect(content, `${path} must not use em or en dashes`).not.toMatch(DASHES);
      }
    });

    it.each(eachTheme(scaffold))('theme %s only references files that exist', (_id, theme) => {
      const files = scaffold.files(theme, PRETTY);
      const html = files['index.html'] ?? '';
      const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(files, `index.html points at missing file ${ref}`).toHaveProperty([ref ?? '']);
      }
    });

    it.each(eachTheme(scaffold))('theme %s is friendly to the preview CSP', (_id, theme) => {
      const files = scaffold.files(theme, PRETTY);
      const html = files['index.html'] ?? '';
      // script-src 'self': no inline script bodies, no inline handlers.
      expect(html).not.toMatch(/<script\b(?![^>]*\bsrc=)/i);
      expect(html).not.toMatch(/\son[a-z]+="/i);
      expect(html).not.toMatch(/javascript:/i);
    });

    it.each(eachTheme(scaffold))('theme %s shows the project name', (_id, theme) => {
      const files = scaffold.files(theme, 'Max & Mia');
      expect(files['index.html']).toContain('Max &amp; Mia');
    });

    it.each(eachTheme(scaffold))('theme %s gives 5 kid-sized starter prompts', (_id, theme) => {
      const prompts = scaffold.starterPrompts(theme);
      expect(prompts).toHaveLength(5);
      for (const prompt of prompts) {
        expect(prompt.trim().length).toBeGreaterThan(10);
        expect(prompt).not.toMatch(DASHES);
        expect(prompt.split(/\s+/).length).toBeLessThanOrEqual(15);
      }
    });

    it.each(eachTheme(scaffold))('theme %s output is deterministic', (_id, theme) => {
      expect(scaffold.files(theme, PRETTY)).toEqual(scaffold.files(theme, PRETTY));
      expect(scaffold.starterPrompts(theme)).toEqual(scaffold.starterPrompts(theme));
    });
  });
}

describe('art scaffold behavior', () => {
  it('is the Pixel Studio with both themes from the plan', () => {
    expect(artScaffold.id).toBe('art');
    expect(artScaffold.themes.map((t) => t.id)).toEqual(['free-draw', 'pet-portraits']);
  });

  it.each(eachTheme(artScaffold))('theme %s paints, saves, and downloads', (_id, theme) => {
    const js = artScaffold.files(theme, PRETTY)['game.js'] ?? '';
    const html = artScaffold.files(theme, PRETTY)['index.html'] ?? '';
    expect(js).toContain('localStorage.setItem');
    expect(js).toContain('localStorage.getItem');
    expect(js).toContain('toDataURL');
    expect(js).toContain('fillArea');
    expect(html).toContain('data-size="16"');
    expect(html).toContain('data-size="32"');
    expect(html).toContain('data-tool="brush"');
    expect(html).toContain('data-tool="eraser"');
    expect(html).toContain('data-tool="fill"');
    expect(html).toContain('id="clear"');
    expect(html).toContain('id="download"');
  });

  it.each(eachTheme(artScaffold))('theme %s ships a real color palette', (_id, theme) => {
    const js = artScaffold.files(theme, PRETTY)['game.js'] ?? '';
    const themeJson = js.slice(js.indexOf('const THEME ='));
    const colors = themeJson.match(/#[0-9a-f]{6}/gi) ?? [];
    expect(colors.length).toBeGreaterThanOrEqual(10);
  });
});

describe('music scaffold behavior', () => {
  it('is the Dance Party with both themes from the plan', () => {
    expect(musicScaffold.id).toBe('music');
    expect(musicScaffold.themes.map((t) => t.id)).toEqual(['robot-dance', 'glow-disco']);
  });

  it.each(eachTheme(musicScaffold))('theme %s synthesizes all sound, no files', (_id, theme) => {
    const files = musicScaffold.files(theme, PRETTY);
    const js = files['game.js'] ?? '';
    expect(js).toContain('AudioContext');
    expect(js).toContain('.resume()');
    expect(js).toContain('createOscillator');
    expect(js).toContain('createBuffer');
    for (const content of Object.values(files)) {
      expect(content).not.toMatch(/\.(mp3|wav|ogg|m4a|flac)\b/i);
    }
  });

  it.each(eachTheme(musicScaffold))('theme %s has 4 rows, 8 steps, tempo, dancer', (_id, theme) => {
    const files = musicScaffold.files(theme, PRETTY);
    const js = files['game.js'] ?? '';
    const html = files['index.html'] ?? '';
    expect(js).toContain('const STEPS = 8');
    const themeStart = js.indexOf('const THEME =');
    const rowCount = (js.slice(themeStart, js.indexOf('const STEPS')).match(/"id": "(kick|clap|beep|boop)"/g) ?? []).length;
    expect(rowCount).toBe(4);
    expect(html).toContain('id="tempo"');
    expect(html).toContain('id="play"');
    expect(html).toContain('id="dancer"');
  });
});

describe('pets scaffold behavior', () => {
  it('is My Pet with both themes from the plan', () => {
    expect(petsScaffold.id).toBe('pets');
    expect(petsScaffold.themes.map((t) => t.id)).toEqual(['dragon', 'wild-horses']);
  });

  it.each(eachTheme(petsScaffold))('theme %s persists and recomputes from timestamps', (_id, theme) => {
    const js = petsScaffold.files(theme, PRETTY)['game.js'] ?? '';
    expect(js).toContain('localStorage.setItem');
    expect(js).toContain('Date.now()');
    expect(js).toContain('updatedAt');
    // Drift derives from elapsed minutes, not from repeated ticking.
    expect(js).toMatch(/pet\.updatedAt\) \/ 60000/);
  });

  it.each(eachTheme(petsScaffold))('theme %s grows through 3 stages and never dies', (_id, theme) => {
    const js = petsScaffold.files(theme, PRETTY)['game.js'] ?? '';
    expect(js).toContain('"stages"');
    const ats = [...js.matchAll(/"at": (\d+)/g)].map((m) => Number(m[1]));
    expect(ats).toHaveLength(3);
    expect(ats[0]).toBe(0);
    expect(ats).toEqual([...ats].sort((a, b) => a - b));
    // Bars clamp at zero. There is no death state anywhere.
    expect(js).toContain('Math.max(0, Math.min(100, value))');
    expect(js).not.toMatch(/\b(die|dies|died|dead|death)\b/i);
  });

  it.each(eachTheme(petsScaffold))('theme %s has feed, play, and nap buttons', (_id, theme) => {
    const html = petsScaffold.files(theme, PRETTY)['index.html'] ?? '';
    expect(html).toContain('id="feed"');
    expect(html).toContain('id="play"');
    expect(html).toContain('id="nap"');
    expect(html).toContain('id="pet-name"');
  });
});
