/**
 * Friendly error screens and process-level crash handling.
 * Provider error bodies never reach the kid. Screens come from T strings only.
 */

import type { ProviderError } from '../types.js';
import { mascot } from './mascot.js';
import { glyph, style } from './theme.js';
import { T } from './text.js';

/** Local clock time when the provider says how long to wait. */
export function formatResetTime(retryAfterSeconds: number, now: Date = new Date()): string {
  const at = new Date(now.getTime() + retryAfterSeconds * 1000);
  return at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function stillWorksBlock(): string {
  const bullet = glyph('star');
  const items = T.quota.stillWorks.map((item) => `  ${bullet} ${item}`);
  return [T.quota.stillWorksIntro, ...items].join('\n');
}

function screen(face: string, lines: string[]): string {
  return [face, '', ...lines].join('\n');
}

/** Map a provider error to a kid-safe mascot screen. */
export function renderProviderError(err: ProviderError, providerLabel: string): string {
  const face = mascot('oops');
  switch (err.kind) {
    case 'rate-limit': {
      const message =
        err.retryAfter !== undefined
          ? T.quota.message.replace('{time}', formatResetTime(err.retryAfter))
          : T.quota.messageNoTime;
      return screen(face, [message, '', stillWorksBlock()]);
    }
    case 'auth':
      return screen(face, [
        T.errors.auth,
        style.dim(`Helper account: ${providerLabel}`),
      ]);
    case 'server':
      return screen(face, [
        T.errors.server,
        style.dim(`Helper account: ${providerLabel}`),
      ]);
    case 'network':
      return screen(face, [T.errors.network, T.offline.network]);
  }
}

/** The screen for an unexpected crash. Details go to the log, not the kid. */
export function renderCrash(logPath: string): string {
  const lines: string[] = [T.errors.crash];
  if (logPath) {
    lines.push(style.dim(`${T.errors.crashSaved} ${logPath}`));
  }
  lines.push(T.errors.crashRestart);
  return screen(mascot('oops'), lines);
}

/** The screen for a safety check that could not finish. Fails closed. */
export function renderFailClosed(): string {
  return screen(mascot('oops'), [T.errors.failClosed]);
}

export interface GlobalHandlerOptions {
  /** Receives a plain-text crash entry to persist (for example to error.log). */
  onCrash(entry: string): void;
  /** Shown dim on the crash screen so a grown-up can find the details. */
  logPath?: string;
  /** Injectable for tests. Defaults to process.exit. */
  exit?: (code: number) => void;
  /** Injectable for tests. Defaults to process.stderr. */
  write?: (text: string) => void;
}

export interface InstalledHandlers {
  /** Remove every handler this call added. */
  uninstall(): void;
  /** Direct entry points, used by tests and by callers that catch their own errors. */
  handleCrash(source: string, err: unknown): void;
  handleSigint(): void;
}

/**
 * Wire process-level failure paths to friendly screens.
 * Crashes: log entry via onCrash, kind screen, exit code 1.
 * Ctrl+C: goodbye line, exit code 0.
 */
export function installGlobalHandlers(opts: GlobalHandlerOptions): InstalledHandlers {
  const exit = opts.exit ?? ((code: number): void => process.exit(code));
  const write = opts.write ?? ((text: string): void => void process.stderr.write(text));

  const handleCrash = (source: string, err: unknown): void => {
    const detail =
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err);
    const entry = `[${new Date().toISOString()}] ${source}\n${detail}\n`;
    try {
      opts.onCrash(entry);
    } catch {
      // The crash handler never crashes.
    }
    write(`\n${renderCrash(opts.logPath ?? '')}\n`);
    exit(1);
  };

  const handleSigint = (): void => {
    write(`\n${T.errors.goodbye}\n`);
    exit(0);
  };

  const onUncaught = (err: unknown): void => handleCrash('uncaughtException', err);
  const onRejection = (reason: unknown): void => handleCrash('unhandledRejection', reason);
  const onSigint = (): void => handleSigint();

  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onRejection);
  process.on('SIGINT', onSigint);

  return {
    uninstall(): void {
      process.removeListener('uncaughtException', onUncaught);
      process.removeListener('unhandledRejection', onRejection);
      process.removeListener('SIGINT', onSigint);
    },
    handleCrash,
    handleSigint,
  };
}
