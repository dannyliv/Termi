/**
 * Cross-turn grooming state. Grooming rarely shows in one message: it builds
 * over a session. We keep a sliding window of recent turns for the prompted
 * classifier and cumulative counters that escalate to a hard block.
 */

import type { SafetyCategory, SessionSafetyState } from '../types.js';
import { normalizeText } from './prefilter.js';

/** Max turns kept in the sliding window. */
export const TURN_WINDOW = 10;
/** Max characters kept per turn. */
export const TURN_CHAR_CAP = 400;
/** Max characters of window text handed to the prompted classifier. */
export const WINDOW_TEXT_CAP = 1500;

export function createSessionState(): SessionSafetyState {
  return {
    recentTurns: [],
    counters: { secrecy: 0, affection: 0, piiProbes: 0, platformMoves: 0 },
  };
}

/** Records a turn into the sliding window (last 10, each capped at 400 chars). */
export function recordTurn(state: SessionSafetyState, role: 'kid' | 'termi', text: string): void {
  state.recentTurns.push({ role, text: text.slice(0, TURN_CHAR_CAP) });
  while (state.recentTurns.length > TURN_WINDOW) {
    state.recentTurns.shift();
  }
}

/** Renders the window for the classifier prompt, capped at ~1,500 chars. */
export function windowText(state: SessionSafetyState): string {
  const joined = state.recentTurns.map((t) => `${t.role}: ${t.text}`).join('\n');
  if (joined.length <= WINDOW_TEXT_CAP) {
    return joined;
  }
  return joined.slice(joined.length - WINDOW_TEXT_CAP);
}

const SECRECY_HINTS = [
  /don'?t tell/i,
  /do not tell/i,
  /our (?:little )?secret/i,
  /keep (?:this|it) (?:a )?secret/i,
  /just between us/i,
  /secret between/i,
  /no one (?:has to|needs to|will) know/i,
];

const AFFECTION_HINTS = [
  /i love you/i,
  /do you love me/i,
  /you'?re my (?:best |special |only )?friend/i,
  /i'?m your (?:best |special |only )?friend/i,
  /you'?re so special to me/i,
  /i care about you more than/i,
];

const PII_PROBE_HINTS = [
  /what'?s your real name/i,
  /what is your real name/i,
  /your real name/i,
  /where do you live/i,
  /what school do you/i,
  /which school/i,
  /your address/i,
  /how old are you really/i,
  /send (?:me )?a (?:photo|picture|pic|selfie)/i,
];

const PLATFORM_HINTS = [
  /add me on/i,
  /\bsnapchat\b/i,
  /\binstagram\b/i,
  /\bwhatsapp\b/i,
  /\btelegram\b/i,
  /\bdiscord\b/i,
  /\btiktok\b/i,
  /text me at/i,
  /\bdm me\b/i,
  /follow me on/i,
  /let'?s chat on/i,
];

function anyHit(patterns: RegExp[], text: string): boolean {
  return patterns.some((re) => re.test(text));
}

/**
 * Bumps cumulative counters from classifier categories and keyword
 * heuristics. Each family moves its counter by at most 1 per call.
 */
export function bumpCounters(
  state: SessionSafetyState,
  verdictCategories: SafetyCategory[],
  text = '',
): void {
  const prepared = normalizeText(text);
  let secrecy = 0;
  let affection = 0;
  let piiProbes = 0;
  let platformMoves = 0;

  if (anyHit(SECRECY_HINTS, prepared)) secrecy = 1;
  if (anyHit(AFFECTION_HINTS, prepared)) affection = 1;
  if (anyHit(PII_PROBE_HINTS, prepared)) piiProbes = 1;
  if (anyHit(PLATFORM_HINTS, prepared)) platformMoves = 1;

  if (verdictCategories.includes('grooming')) {
    // A grooming hit without a sharper keyword match still counts somewhere.
    if (secrecy + affection + piiProbes + platformMoves === 0) {
      affection = 1;
    }
  }
  if (verdictCategories.includes('pii')) {
    piiProbes = 1;
  }

  state.counters.secrecy += secrecy;
  state.counters.affection += affection;
  state.counters.piiProbes += piiProbes;
  state.counters.platformMoves += platformMoves;
}

/**
 * True when the cumulative pattern crosses the escalation line:
 * any single counter at 2+, or 3+ signals total across the session.
 */
export function groomingEscalation(state: SessionSafetyState): boolean {
  const { secrecy, affection, piiProbes, platformMoves } = state.counters;
  const total = secrecy + affection + piiProbes + platformMoves;
  return secrecy >= 2 || affection >= 2 || piiProbes >= 2 || platformMoves >= 2 || total >= 3;
}
