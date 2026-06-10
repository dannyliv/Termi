import { describe, expect, it } from 'vitest';
import { EXTRACT_CHAR_CAP, extractVisibleText, TRUNCATION_NOTE } from '../src/safety/textextract.js';

describe('HTML extraction', () => {
  const html = [
    '<!doctype html>',
    '<html><head><title>My Spooky Game</title>',
    '<style>body { color: red; }</style>',
    '</head><body>',
    '<h1>Welcome, hero!</h1>',
    '<img src="ghost.png" alt="a friendly ghost">',
    '<button title="Start here" aria-label="Start the game">Go</button>',
    '<p>Score &amp; candy count</p>',
    '<!-- a hidden html comment -->',
    '<script>const secret = "inline script text";</script>',
    '</body></html>',
  ].join('\n');

  it('returns text nodes and title/alt/aria-label values', () => {
    const out = extractVisibleText('index.html', html);
    expect(out).toContain('My Spooky Game');
    expect(out).toContain('Welcome, hero!');
    expect(out).toContain('a friendly ghost');
    expect(out).toContain('Start here');
    expect(out).toContain('Start the game');
    expect(out).toContain('Go');
    expect(out).toContain('Score & candy count');
  });

  it('drops tags, scripts, styles, and comments', () => {
    const out = extractVisibleText('index.html', html);
    expect(out).not.toContain('<h1>');
    expect(out).not.toContain('inline script text');
    expect(out).not.toContain('color: red');
    expect(out).not.toContain('a hidden html comment');
  });
});

describe('JS extraction', () => {
  const js = [
    '// spawn the ghost every level',
    'const winMsg = "You win the haunted cup!";',
    "const loseMsg = 'The ghost got you. Try again!';",
    'const greet = `Hello ${player.name}, brave explorer`;',
    '/* block comment about the boss fight */',
    'const esc = "say \\"boo\\" loudly";',
    'let score = 0;',
    'const winMsg2 = "You win the haunted cup!";',
  ].join('\n');

  it('returns string literals and comments', () => {
    const out = extractVisibleText('game.js', js);
    expect(out).toContain('spawn the ghost every level');
    expect(out).toContain('You win the haunted cup!');
    expect(out).toContain('The ghost got you. Try again!');
    expect(out).toContain('block comment about the boss fight');
    expect(out).toContain('say "boo" loudly');
  });

  it('keeps template text but skips interpolation code', () => {
    const out = extractVisibleText('game.js', js);
    expect(out).toContain('Hello');
    expect(out).toContain('brave explorer');
    expect(out).not.toContain('player.name');
  });

  it('does not return plain code', () => {
    const out = extractVisibleText('game.js', js);
    expect(out).not.toContain('let score = 0');
  });

  it('deduplicates repeated strings', () => {
    const out = extractVisibleText('game.js', js);
    const hits = out.split('\n').filter((l) => l === 'You win the haunted cup!');
    expect(hits).toHaveLength(1);
  });
});

describe('MD, TXT, and CSS extraction', () => {
  it('returns markdown prose as-is', () => {
    const md = '# My Project\nThis game has 3 spooky levels.';
    const out = extractVisibleText('TERMI.md', md);
    expect(out).toContain('# My Project');
    expect(out).toContain('This game has 3 spooky levels.');
  });

  it('returns txt content', () => {
    expect(extractVisibleText('notes.txt', 'remember the candy bonus')).toContain('remember the candy bonus');
  });

  it('returns css content: property values only', () => {
    const css = 'h1::before { content: "Boo!"; }\nbody { background: black; }';
    const out = extractVisibleText('style.css', css);
    expect(out).toContain('Boo!');
    expect(out).not.toContain('background');
  });
});

describe('cap and truncation', () => {
  it('caps output at 6,000 chars with a note', () => {
    const lines: string[] = [];
    for (let i = 0; i < 900; i++) {
      lines.push(`line number ${i} with some words in it`);
    }
    const out = extractVisibleText('TERMI.md', lines.join('\n'));
    expect(out.length).toBeLessThanOrEqual(EXTRACT_CHAR_CAP + TRUNCATION_NOTE.length + 1);
    expect(out).toContain(TRUNCATION_NOTE);
  });

  it('short content is not truncated', () => {
    const out = extractVisibleText('TERMI.md', 'short and sweet');
    expect(out).not.toContain(TRUNCATION_NOTE);
  });
});
