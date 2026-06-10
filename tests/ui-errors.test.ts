import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import chalk from 'chalk';
import type { ProviderError } from '../src/types.js';
import {
  formatResetTime,
  installGlobalHandlers,
  renderCrash,
  renderFailClosed,
  renderProviderError,
} from '../src/ui/errors.js';
import { T } from '../src/ui/text.js';
import { resetUnicodeCache } from '../src/ui/theme.js';

const savedAscii = process.env['TERMI_ASCII'];
const savedLevel = chalk.level;

beforeEach(() => {
  process.env['TERMI_ASCII'] = '1';
  chalk.level = 0;
  resetUnicodeCache();
});

afterEach(() => {
  if (savedAscii === undefined) delete process.env['TERMI_ASCII'];
  else process.env['TERMI_ASCII'] = savedAscii;
  chalk.level = savedLevel;
  resetUnicodeCache();
});

describe('renderProviderError', () => {
  it('shows the quota screen with a reset time for rate limits', () => {
    const err: ProviderError = { kind: 'rate-limit', retryAfter: 1800 };
    const screen = renderProviderError(err, 'Test Helper');
    expect(screen).toContain('energy');
    expect(screen).toContain('comes back at');
    expect(screen).toContain(T.quota.stillWorksIntro);
    expect(screen).toContain('/undo');
  });

  it('falls back to the no-time quota message', () => {
    const screen = renderProviderError({ kind: 'rate-limit' }, 'Test Helper');
    expect(screen).toContain(T.quota.messageNoTime);
  });

  it('sends auth problems to a grown-up', () => {
    const screen = renderProviderError({ kind: 'auth' }, 'Test Helper');
    expect(screen).toContain(T.errors.auth);
    expect(screen).toContain('Test Helper');
  });

  it('handles server and network kinds kindly', () => {
    expect(renderProviderError({ kind: 'server' }, 'X')).toContain(T.errors.server);
    expect(renderProviderError({ kind: 'network' }, 'X')).toContain(T.errors.network);
  });

  it('shows the oops mascot face', () => {
    const screen = renderProviderError({ kind: 'server' }, 'X');
    expect(screen).toContain('oops!');
  });
});

describe('renderCrash and renderFailClosed', () => {
  it('points a grown-up at the log without scaring the kid', () => {
    const screen = renderCrash('/tmp/termi-error.log');
    expect(screen).toContain(T.errors.crash);
    expect(screen).toContain('/tmp/termi-error.log');
    expect(screen).toContain(T.errors.crashRestart);
  });

  it('omits the path line when no path is known', () => {
    const screen = renderCrash('');
    expect(screen).not.toContain(T.errors.crashSaved);
  });

  it('renders the fail-closed break screen', () => {
    const screen = renderFailClosed();
    expect(screen).toContain(T.errors.failClosed);
  });
});

describe('formatResetTime', () => {
  it('adds the wait to the current time', () => {
    const now = new Date('2026-01-01T12:00:00');
    expect(formatResetTime(1800, now)).toContain('30');
  });
});

describe('installGlobalHandlers', () => {
  it('registers and cleanly removes process listeners', () => {
    const baseSigint = process.listeners('SIGINT').length;
    const baseUncaught = process.listeners('uncaughtException').length;
    const handlers = installGlobalHandlers({ onCrash: () => undefined, exit: () => undefined, write: () => undefined });
    expect(process.listeners('SIGINT').length).toBe(baseSigint + 1);
    expect(process.listeners('uncaughtException').length).toBe(baseUncaught + 1);
    handlers.uninstall();
    expect(process.listeners('SIGINT').length).toBe(baseSigint);
    expect(process.listeners('uncaughtException').length).toBe(baseUncaught);
  });

  it('logs the crash, prints a kind screen, and exits 1', () => {
    const onCrash = vi.fn();
    const exit = vi.fn();
    const writes: string[] = [];
    const handlers = installGlobalHandlers({
      onCrash,
      logPath: '/tmp/err.log',
      exit,
      write: (text) => writes.push(text),
    });
    handlers.handleCrash('uncaughtException', new Error('boom'));
    handlers.uninstall();

    expect(onCrash).toHaveBeenCalledTimes(1);
    const entry = onCrash.mock.calls[0]?.[0] as string;
    expect(entry).toContain('boom');
    expect(entry).toContain('uncaughtException');
    expect(writes.join('')).toContain(T.errors.crash);
    expect(writes.join('')).toContain('/tmp/err.log');
    expect(writes.join('')).not.toContain('boom');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('says goodbye and exits 0 on Ctrl+C', () => {
    const exit = vi.fn();
    const writes: string[] = [];
    const handlers = installGlobalHandlers({
      onCrash: () => undefined,
      exit,
      write: (text) => writes.push(text),
    });
    handlers.handleSigint();
    handlers.uninstall();

    expect(writes.join('')).toContain(T.errors.goodbye);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('survives a crash inside the onCrash callback', () => {
    const exit = vi.fn();
    const handlers = installGlobalHandlers({
      onCrash: () => {
        throw new Error('log disk full');
      },
      exit,
      write: () => undefined,
    });
    expect(() => handlers.handleCrash('unhandledRejection', 'reason')).not.toThrow();
    handlers.uninstall();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
