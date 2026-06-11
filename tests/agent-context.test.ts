import { describe, expect, it } from 'vitest';
import {
  buildMessages,
  createEmbedState,
  firstCommentLine,
  HISTORY_CHAR_BUDGET,
  HISTORY_TURN_CAP,
  providerOptionsFor,
  TERMI_MD_LINE_CAP,
  trimHistory,
  type HistoryEntry,
} from '../src/agent/context.js';
import { FakeProject } from './agent-fakes.js';

const passthrough = { prefilterContext: (text: string): string => text };

function makeProject(): FakeProject {
  const project = new FakeProject();
  project.files.set('index.html', '<!-- the page -->\n<canvas></canvas>');
  project.files.set('game.js', '// the game loop\nlet score = 0;\n');
  return project;
}

function lastContent(messages: ReturnType<typeof buildMessages>): string {
  const last = messages[messages.length - 1];
  return typeof last?.content === 'string' ? last.content : '';
}

describe('changed-files-only embedding', () => {
  it('embeds every file in full on the first turn', () => {
    const project = makeProject();
    const embed = createEmbedState();
    const text = lastContent(buildMessages(project, [], 'hi', embed, passthrough));
    expect(text).toContain('<project_file path="index.html">');
    expect(text).toContain('<project_file path="game.js">');
    expect(text).toContain('let score = 0;');
    expect(text).not.toContain('<project_file_list');
  });

  it('elides unchanged files on the next turn, with a read_file note', () => {
    const project = makeProject();
    const embed = createEmbedState();
    buildMessages(project, [], 'hi', embed, passthrough);
    const text = lastContent(buildMessages(project, [], 'again', embed, passthrough));
    expect(text).not.toContain('<project_file path=');
    expect(text).toContain('<project_file_list');
    expect(text).toContain('read_file');
    expect(text).toContain('game.js (');
    // The one-line listing carries the first comment line.
    expect(text).toContain('the game loop');
    expect(text).toContain('the page');
  });

  it('re-embeds only the file that changed', () => {
    const project = makeProject();
    const embed = createEmbedState();
    buildMessages(project, [], 'hi', embed, passthrough);
    project.writeFile('game.js', '// the game loop\nlet score = 10;\n');
    const text = lastContent(buildMessages(project, [], 'next', embed, passthrough));
    expect(text).toContain('<project_file path="game.js">');
    expect(text).toContain('let score = 10;');
    expect(text).not.toContain('<project_file path="index.html">');
    expect(text).toContain('index.html (');
  });

  it('forgets embed state for deleted files', () => {
    const project = makeProject();
    const embed = createEmbedState();
    buildMessages(project, [], 'hi', embed, passthrough);
    project.files.delete('game.js');
    buildMessages(project, [], 'next', embed, passthrough);
    expect(embed.has('game.js')).toBe(false);
  });
});

describe('composed turn message', () => {
  it('wraps the kid message in its data tag, after notes and files', () => {
    const project = makeProject();
    const text = lastContent(
      buildMessages(project, [], 'make the ship faster', createEmbedState(), passthrough),
    );
    expect(text).toContain('<kid_message>\nmake the ship faster\n</kid_message>');
    expect(text.indexOf('<project_notes>')).toBeLessThan(text.indexOf('<kid_message>'));
  });

  it('caps TERMI.md at 60 lines', () => {
    const project = makeProject();
    project.termiMd = Array.from({ length: 100 }, (_, i) => `note line ${i + 1}`).join('\n');
    const text = lastContent(buildMessages(project, [], 'hi', createEmbedState(), passthrough));
    expect(text).toContain(`note line ${TERMI_MD_LINE_CAP}`);
    expect(text).not.toContain(`note line ${TERMI_MD_LINE_CAP + 1}`);
  });

  it('runs every untrusted section through prefilterContext', () => {
    const project = makeProject();
    const marked = { prefilterContext: (text: string): string => `CTX|${text}` };
    const text = lastContent(buildMessages(project, [], 'hello', createEmbedState(), marked));
    expect(text).toContain('CTX|hello');
    expect(text).toContain('CTX|<!-- the page -->');
    expect(text).toContain('CTX|# Sky Dash');
  });

  it('maps history to user and assistant messages before the final message', () => {
    const project = makeProject();
    const history: HistoryEntry[] = [
      { role: 'kid', text: 'add a star' },
      { role: 'termi', text: 'Star added!' },
    ];
    const messages = buildMessages(project, history, 'now two', createEmbedState(), passthrough);
    expect(messages[0]).toEqual({ role: 'user', content: 'add a star' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Star added!' });
    expect(messages).toHaveLength(3);
  });
});

describe('trimHistory', () => {
  function pairs(count: number, textLength = 10): HistoryEntry[] {
    const out: HistoryEntry[] = [];
    for (let i = 0; i < count; i++) {
      out.push({ role: 'kid', text: `k${i}`.padEnd(textLength, 'x') });
      out.push({ role: 'termi', text: `t${i}`.padEnd(textLength, 'x') });
    }
    return out;
  }

  it('keeps at most the turn cap, newest last', () => {
    const trimmed = trimHistory(pairs(40));
    expect(trimmed.length).toBeLessThanOrEqual(HISTORY_TURN_CAP);
    expect(trimmed[trimmed.length - 1]?.text.startsWith('t39')).toBe(true);
    expect(trimmed[0]?.role).toBe('kid');
  });

  it('enforces the char budget, dropping oldest first', () => {
    const big = pairs(10, 1000);
    const trimmed = trimHistory(big);
    const total = trimmed.reduce((sum, e) => sum + e.text.length, 0);
    expect(total).toBeLessThanOrEqual(HISTORY_CHAR_BUDGET);
    expect(trimmed[trimmed.length - 1]?.text.startsWith('t9')).toBe(true);
  });

  it('never starts with an orphaned termi reply', () => {
    const entries = pairs(10, 1000);
    // Push an extra kid-only entry so the budget cut can land mid-pair.
    entries.push({ role: 'kid', text: 'k-last'.padEnd(1000, 'x') });
    const trimmed = trimHistory(entries);
    expect(trimmed[0]?.role).toBe('kid');
  });

  it('returns short histories untouched', () => {
    const short = pairs(2);
    expect(trimHistory(short)).toEqual(short);
  });
});

describe('firstCommentLine', () => {
  it('finds line comments, block comments, and html comments', () => {
    expect(firstCommentLine('// hello world\ncode();')).toBe('hello world');
    expect(firstCommentLine('/* styles here */\nbody {}')).toBe('styles here');
    expect(firstCommentLine('<!-- my page -->\n<div></div>')).toBe('my page');
  });

  it('ignores urls and comment-free files', () => {
    expect(firstCommentLine('const u = "https://example.com";')).toBeNull();
    expect(firstCommentLine('let x = 1;')).toBeNull();
  });
});

describe('providerOptionsFor', () => {
  it('puts an ephemeral cache point on the system message for anthropic', () => {
    const options = providerOptionsFor('anthropic');
    expect(options.system).toEqual({ anthropic: { cacheControl: { type: 'ephemeral' } } });
    expect(options.call).toEqual({});
  });

  it('runs the ChatGPT sign-in path stateless with encrypted reasoning', () => {
    const options = providerOptionsFor('openai-chatgpt');
    expect(options.call).toEqual({
      openai: { store: false, include: ['reasoning.encrypted_content'] },
    });
    expect(options.system).toEqual({});
  });

  it('sends nothing extra for openai-api and xai', () => {
    expect(providerOptionsFor('openai-api')).toEqual({ call: {}, system: {} });
    expect(providerOptionsFor('xai')).toEqual({ call: {}, system: {} });
  });
});
