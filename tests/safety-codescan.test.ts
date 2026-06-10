import { describe, expect, it } from 'vitest';
import { scanCode } from '../src/safety/codescan.js';
import { scaffolds } from '../src/projects/scaffolds/index.js';

describe('codescan catalog: bad snippets are flagged', () => {
  // Every snippet below is an inert string fixture. Nothing here is executed:
  // the test asserts that scanCode REJECTS these patterns in kid project files.
  const bad: { name: string; path: string; code: string }[] = [
    { name: 'fetch', path: 'game.js', code: 'fetch("https://example.com/data.json")' },
    { name: 'XMLHttpRequest', path: 'game.js', code: 'const xhr = new XMLHttpRequest();' },
    { name: 'WebSocket', path: 'game.js', code: 'const ws = new WebSocket("wss://example.com");' },
    { name: 'EventSource', path: 'game.js', code: 'const es = new EventSource("/events");' },
    { name: 'sendBeacon', path: 'game.js', code: 'navigator.sendBeacon("/log", data);' },
    { name: 'RTCPeerConnection', path: 'game.js', code: 'const pc = new RTCPeerConnection();' },
    { name: 'external image src', path: 'game.js', code: 'img.src = "https://example.com/x.png";' },
    { name: 'external dynamic import', path: 'game.js', code: 'await import("https://example.com/mod.js");' },
    { name: 'external static import', path: 'game.js', code: 'import lib from "https://example.com/lib.js";' },
    { name: 'protocol-relative import', path: 'game.js', code: 'import lib from "//example.com/lib.js";' },
    { name: 'external script tag', path: 'index.html', code: '<script src="https://example.com/lib.js"></script>' },
    { name: 'external link tag', path: 'index.html', code: '<link rel="stylesheet" href="https://example.com/a.css">' },
    { name: 'external form action', path: 'index.html', code: '<form action="https://example.com/collect">' },
    { name: 'eval', path: 'game.js', code: 'eval("score = 9999");' },
    { name: 'new Function', path: 'game.js', code: 'const f = new Function("return 1");' },
    { name: 'string setTimeout', path: 'game.js', code: 'setTimeout("tick()", 100);' },
    { name: 'string setInterval', path: 'game.js', code: 'setInterval(\'tick()\', 100);' },
    { name: 'document.cookie', path: 'game.js', code: 'document.cookie = "id=1";' },
    { name: 'javascript: URI', path: 'index.html', code: '<a href="javascript:alert(1)">go</a>' },
    { name: 'data:text/html URI', path: 'index.html', code: '<iframe src="data:text/html,<h1>x</h1>"></iframe>' },
    { name: 'iframe srcdoc', path: 'index.html', code: '<iframe srcdoc="<p>hi</p>"></iframe>' },
    { name: 'base tag', path: 'index.html', code: '<base href="https://example.com/">' },
    { name: 'meta refresh with url', path: 'index.html', code: '<meta http-equiv="refresh" content="0;url=https://example.com">' },
    { name: 'external css url()', path: 'style.css', code: 'body { background: url(https://example.com/bg.png); }' },
    { name: 'external css @import', path: 'style.css', code: '@import "https://example.com/a.css";' },
  ];

  it.each(bad)('flags $name', ({ path, code }) => {
    const result = scanCode(path, code);
    expect(result.ok).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons[0]).toContain(path);
  });
});

describe('codescan: local references pass', () => {
  const good: { name: string; path: string; code: string }[] = [
    { name: 'local engine import', path: 'game.js', code: 'import kaplay from "./kaplay.mjs";' },
    {
      name: 'canvas plus localStorage',
      path: 'game.js',
      code: [
        'const canvas = document.querySelector("canvas");',
        'const ctx = canvas.getContext("2d");',
        'localStorage.setItem("best", String(score));',
        'setTimeout(() => spawn(), 500);',
      ].join('\n'),
    },
    { name: 'local script tag', path: 'index.html', code: '<script type="module" src="game.js"></script>' },
    { name: 'local stylesheet', path: 'index.html', code: '<link rel="stylesheet" href="style.css">' },
    { name: 'local form', path: 'index.html', code: '<form action="#" id="aboutForm"></form>' },
    { name: 'local css url', path: 'style.css', code: '.hero { background: url("hero.png"); }' },
    { name: 'word fetch in prose string', path: 'game.js', code: 'const tip = "the dog plays fetch in the park";' },
  ];

  it.each(good)('passes $name', ({ path, code }) => {
    const result = scanCode(path, code);
    expect(result.ok, result.reasons.join('; ')).toBe(true);
  });
});

describe('codescan: file-kind routing', () => {
  it('skips TERMI.md and .txt (text classification covers them)', () => {
    expect(scanCode('TERMI.md', 'fetch("https://example.com") and eval()').ok).toBe(true);
    expect(scanCode('notes.txt', '<script src="https://x.com/a.js">').ok).toBe(true);
  });

  it('scans .mjs like .js', () => {
    expect(scanCode('engine.mjs', 'eval("x")').ok).toBe(false);
  });
});

describe('codescan: every scaffold output passes', () => {
  const cases = scaffolds.flatMap((scaffold) =>
    scaffold.themes.map((theme) => ({
      label: `${scaffold.id}/${theme.id}`,
      scaffold,
      theme,
    })),
  );

  it('covers all 9 categories', () => {
    expect(scaffolds).toHaveLength(9);
  });

  it.each(cases)('$label scaffold files are clean', ({ scaffold, theme }) => {
    const files = scaffold.files(theme, 'Test Project');
    expect(Object.keys(files).length).toBeGreaterThan(0);
    for (const [relPath, content] of Object.entries(files)) {
      const result = scanCode(relPath, content);
      expect(result.ok, `${relPath}: ${result.reasons.join('; ')}`).toBe(true);
    }
  });
});
