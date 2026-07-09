import { describe, expect, it } from 'vitest';
import { DASH_RE, fkGrade } from './ui-fk.js';
import type { PreviewHandle, SnapshotStore } from '../src/types.js';
import {
  BARE_WORDS,
  COMMAND_NAMES,
  donEarnsGameBadge,
  executeDone,
  executeRedo,
  executeUndo,
  helpText,
  levenshtein,
  nearestCommand,
  parseCommand,
} from '../src/surfaces/commands.js';

describe('parseCommand: slash commands', () => {
  it('recognizes every known slash command', () => {
    for (const name of COMMAND_NAMES) {
      expect(parseCommand(`/${name}`)).toEqual({ kind: name });
    }
  });

  it('is case insensitive and tolerant of spacing', () => {
    expect(parseCommand('/UNDO')).toEqual({ kind: 'undo' });
    expect(parseCommand('  /preview  ')).toEqual({ kind: 'preview' });
    expect(parseCommand('/ undo')).toEqual({ kind: 'undo' });
  });

  it('ignores extra words after the command', () => {
    expect(parseCommand('/help me please')).toEqual({ kind: 'help' });
    expect(parseCommand('/undo everything')).toEqual({ kind: 'undo' });
  });
});

describe('parseCommand: bare words', () => {
  it('accepts the documented bare words', () => {
    for (const word of BARE_WORDS) {
      expect(parseCommand(word)).toEqual({ kind: word });
      expect(parseCommand(word.toUpperCase())).toEqual({ kind: word });
    }
  });

  it('does not treat redo, new, or grownups as bare words', () => {
    expect(parseCommand('redo')).toEqual({ kind: 'chat', text: 'redo' });
    expect(parseCommand('new')).toEqual({ kind: 'chat', text: 'new' });
    expect(parseCommand('grownups')).toEqual({ kind: 'chat', text: 'grownups' });
  });

  it('leaves multi-word messages as chat even when they start with a command word', () => {
    expect(parseCommand('undo my homework')).toEqual({ kind: 'chat', text: 'undo my homework' });
    expect(parseCommand('help the wizard fly')).toEqual({
      kind: 'chat',
      text: 'help the wizard fly',
    });
  });
});

describe('parseCommand: chat and unknowns', () => {
  it('treats normal text as chat', () => {
    expect(parseCommand('make the sky purple')).toEqual({
      kind: 'chat',
      text: 'make the sky purple',
    });
  });

  it('returns empty chat for blank input', () => {
    expect(parseCommand('   ')).toEqual({ kind: 'chat', text: '' });
  });

  it('suggests the closest command within two edits', () => {
    expect(parseCommand('/undoo')).toEqual({ kind: 'unknown', word: 'undoo', suggestion: 'undo' });
    expect(parseCommand('/previw')).toEqual({
      kind: 'unknown',
      word: 'previw',
      suggestion: 'preview',
    });
    expect(parseCommand('/idea')).toEqual({ kind: 'unknown', word: 'idea', suggestion: 'ideas' });
  });

  it('gives no suggestion for far-off words', () => {
    expect(parseCommand('/xyzzyplugh')).toEqual({
      kind: 'unknown',
      word: 'xyzzyplugh',
      suggestion: null,
    });
    expect(parseCommand('/')).toEqual({ kind: 'unknown', word: '', suggestion: null });
  });
});

describe('levenshtein and nearestCommand', () => {
  it('computes edit distance', () => {
    expect(levenshtein('undo', 'undo')).toBe(0);
    expect(levenshtein('undo', 'undoo')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('respects the max distance', () => {
    expect(nearestCommand('undi')).toBe('undo');
    expect(nearestCommand('zzzzzz')).toBeNull();
  });
});

describe('helpText', () => {
  it('lists every command', () => {
    const text = helpText();
    for (const name of COMMAND_NAMES) {
      expect(text).toContain(`/${name}`);
    }
  });
});

function fakeSnapshots(undoOk: boolean, redoOk: boolean): SnapshotStore {
  return { beginTurn: () => undefined, undo: () => undoOk, redo: () => redoOk };
}

function fakePreview(): { handle: PreviewHandle; notifications: () => number } {
  let count = 0;
  const handle: PreviewHandle = {
    url: 'http://127.0.0.1:4311/',
    port: 4311,
    notifyChange: () => {
      count += 1;
    },
    stop: () => Promise.resolve(),
  };
  return { handle, notifications: () => count };
}

describe('executeUndo / executeRedo', () => {
  it('notifies the preview and confirms on success', () => {
    const { handle, notifications } = fakePreview();
    const lines: string[] = [];
    const ok = executeUndo(fakeSnapshots(true, false), handle, (t) => lines.push(t));
    expect(ok).toBe(true);
    expect(notifications()).toBe(1);
    expect(lines.join('\n')).toContain('Undone');
  });

  it('says there is nothing to undo without touching the preview', () => {
    const { handle, notifications } = fakePreview();
    const lines: string[] = [];
    const ok = executeUndo(fakeSnapshots(false, false), handle, (t) => lines.push(t));
    expect(ok).toBe(false);
    expect(notifications()).toBe(0);
    expect(lines.join('\n')).toContain('nothing to undo');
  });

  it('redo mirrors undo', () => {
    const { handle, notifications } = fakePreview();
    const lines: string[] = [];
    expect(executeRedo(fakeSnapshots(false, true), handle, (t) => lines.push(t))).toBe(true);
    expect(notifications()).toBe(1);
    expect(executeRedo(fakeSnapshots(false, false), null, (t) => lines.push(t))).toBe(false);
  });
});

describe('executeDone', () => {
  it('awards the game badge and writes the recap for game projects', async () => {
    const awarded: string[] = [];
    const lines: string[] = [];
    let recap = '';
    await executeDone(
      {
        scaffoldId: 'games',
        prettyName: 'Sky Dash',
        updateRecap: (line) => {
          recap = line;
        },
      },
      (id) => {
        awarded.push(id);
        return Promise.resolve(true);
      },
      (t) => lines.push(t),
    );
    expect(awarded).toEqual(['game-shipped']);
    expect(recap).toContain('Sky Dash');
    expect(lines.join('\n')).toContain('shipped');
  });

  it('skips the game badge for non-game projects', async () => {
    const awarded: string[] = [];
    await executeDone(
      { scaffoldId: 'art', prettyName: 'Pet Portraits', updateRecap: () => undefined },
      (id) => {
        awarded.push(id);
        return Promise.resolve(true);
      },
      () => undefined,
    );
    expect(awarded).toEqual([]);
  });

  it('knows which scaffolds count as games', () => {
    expect(donEarnsGameBadge('games')).toBe(true);
    expect(donEarnsGameBadge('biggames')).toBe(true);
    expect(donEarnsGameBadge('stories')).toBe(false);
  });
});

describe('quit command', () => {
  it('parses /quit and the bare word', () => {
    expect(parseCommand('/quit')).toEqual({ kind: 'quit' });
    expect(parseCommand('quit')).toEqual({ kind: 'quit' });
    expect(parseCommand('QUIT')).toEqual({ kind: 'quit' });
  });

  it('maps the leaving words kids type to quit', () => {
    for (const word of ['exit', 'stop', 'bye', 'leave', '/exit', '/bye']) {
      expect(parseCommand(word), word).toEqual({ kind: 'quit' });
    }
  });

  it('leaves sentences containing leaving words as chat', () => {
    expect(parseCommand('stop the music when I win').kind).toBe('chat');
    expect(parseCommand('make the exit door red').kind).toBe('chat');
  });

  it('shows /quit in the help list', () => {
    expect(helpText()).toContain('/quit');
    expect(helpText()).toContain('quit');
  });
});

describe('new kid copy quality', () => {
  it('help copy reads at kid level with no fancy dashes', () => {
    const text = helpText();
    expect(DASH_RE.test(text)).toBe(false);
    for (const line of ['stop for today', 'Plain words work too, like undo, ideas, or quit.']) {
      expect(fkGrade(line), line).toBeLessThanOrEqual(6.5);
      expect(DASH_RE.test(line)).toBe(false);
    }
  });

  it('the name screening copy reads at kid level', () => {
    for (const line of [
      'That name will not work. Pick a made-up one.',
      'That name will not work. Try another one.',
    ]) {
      expect(fkGrade(line), line).toBeLessThanOrEqual(6.5);
      expect(DASH_RE.test(line)).toBe(false);
    }
  });
});
