/**
 * Background fetcher for the on-device classifier model.
 *
 * One in-flight download per process, kicked off without blocking whatever
 * the kid or parent is doing. Progress is observable (the home menu and the
 * grown-ups panel render it as a bar), completion is auditable, and the
 * safety pipeline hot-attaches the classifier on its next check once the
 * verified file lands. Interrupted transfers resume on the next kickoff.
 */

import { appendAudit } from './audit.js';
import {
  downloadGuardModel,
  GUARD_MODEL,
  guardModelReady,
  type DownloadGuardOptions,
} from './modelstore.js';

export type GuardFetchStatus = 'idle' | 'downloading' | 'ready' | 'failed';

export interface GuardFetchState {
  status: GuardFetchStatus;
  written: number;
  total: number;
}

let state: GuardFetchState = { status: 'idle', written: 0, total: GUARD_MODEL.bytes };
let inFlight: Promise<boolean> | null = null;

/** Snapshot of the background fetch. 'ready' wins once the file exists. */
export function guardFetchState(): GuardFetchState {
  if (state.status !== 'downloading' && guardModelReady()) {
    return { status: 'ready', written: GUARD_MODEL.bytes, total: GUARD_MODEL.bytes };
  }
  return { ...state };
}

function audit(excerpt: string): void {
  try {
    appendAudit({ ts: new Date().toISOString(), layer: 'system', event: 'settings_change', excerpt });
  } catch {
    // The fetcher never falls over because the audit disk write failed.
  }
}

/**
 * Starts the background download when the model is missing and nothing is
 * already in flight. Returns the in-flight promise (true = model ready) so
 * blocking callers, like the grown-ups panel, can await it; fire-and-forget
 * callers just ignore it.
 */
export function ensureGuardFetch(opts: DownloadGuardOptions = {}): Promise<boolean> {
  if (guardModelReady()) {
    state = { status: 'ready', written: GUARD_MODEL.bytes, total: GUARD_MODEL.bytes };
    return Promise.resolve(true);
  }
  if (inFlight !== null) {
    return inFlight;
  }
  state = { status: 'downloading', written: 0, total: opts.artifact?.bytes ?? GUARD_MODEL.bytes };
  inFlight = downloadGuardModel({
    ...opts,
    onProgress: (written, total) => {
      state.written = written;
      state.total = total;
      opts.onProgress?.(written, total);
    },
  })
    .then(() => {
      state = { ...state, status: 'ready', written: state.total };
      audit('local classifier model downloaded');
      return true;
    })
    .catch(() => {
      state = { ...state, status: 'failed' };
      audit('local classifier model download failed');
      return false;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Resets module state (tests only). */
export function resetGuardFetchForTests(): void {
  state = { status: 'idle', written: 0, total: GUARD_MODEL.bytes };
  inFlight = null;
}

const BAR_SLOTS = 10;

/** A kid-friendly progress bar: [####______] 42% of 623 MB. */
export function guardProgressBar(snapshot: GuardFetchState = guardFetchState()): string {
  const share = snapshot.total > 0 ? Math.min(1, snapshot.written / snapshot.total) : 0;
  const filled = Math.floor(share * BAR_SLOTS);
  const bar = '#'.repeat(filled) + '_'.repeat(BAR_SLOTS - filled);
  return `[${bar}] ${Math.floor(share * 100)}% of ${GUARD_MODEL.displaySize}`;
}
