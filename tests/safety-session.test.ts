import { describe, expect, it } from 'vitest';
import {
  bumpCounters,
  createSessionState,
  groomingEscalation,
  recordTurn,
  TURN_CHAR_CAP,
  TURN_WINDOW,
  windowText,
  WINDOW_TEXT_CAP,
} from '../src/safety/session.js';

describe('session state', () => {
  it('starts empty with zeroed counters', () => {
    const state = createSessionState();
    expect(state.recentTurns).toEqual([]);
    expect(state.counters).toEqual({ secrecy: 0, affection: 0, piiProbes: 0, platformMoves: 0 });
  });

  it('keeps a window of 10 turns', () => {
    const state = createSessionState();
    for (let i = 0; i < 15; i++) {
      recordTurn(state, i % 2 === 0 ? 'kid' : 'termi', `turn ${i}`);
    }
    expect(state.recentTurns).toHaveLength(TURN_WINDOW);
    expect(state.recentTurns[0]?.text).toBe('turn 5');
    expect(state.recentTurns[9]?.text).toBe('turn 14');
  });

  it('truncates each turn to 400 chars', () => {
    const state = createSessionState();
    recordTurn(state, 'kid', 'x'.repeat(1000));
    expect(state.recentTurns[0]?.text).toHaveLength(TURN_CHAR_CAP);
  });

  it('windowText is capped at ~1,500 chars and keeps the newest text', () => {
    const state = createSessionState();
    for (let i = 0; i < 10; i++) {
      recordTurn(state, 'kid', `${i}-${'y'.repeat(390)}`);
    }
    const text = windowText(state);
    expect(text.length).toBeLessThanOrEqual(WINDOW_TEXT_CAP);
    expect(text).toContain('9-');
  });
});

describe('counters', () => {
  it('keyword heuristics bump the right counters', () => {
    const state = createSessionState();
    bumpCounters(state, [], "don't tell your mom about this");
    bumpCounters(state, [], 'i love you so much');
    bumpCounters(state, [], "what's your real name?");
    bumpCounters(state, [], 'add me on snapchat');
    expect(state.counters).toEqual({ secrecy: 1, affection: 1, piiProbes: 1, platformMoves: 1 });
  });

  it('a grooming category hit without keywords still counts', () => {
    const state = createSessionState();
    bumpCounters(state, ['grooming'], 'something subtle');
    expect(state.counters.affection).toBe(1);
  });

  it('a pii category hit bumps piiProbes', () => {
    const state = createSessionState();
    bumpCounters(state, ['pii'], 'something with details');
    expect(state.counters.piiProbes).toBe(1);
  });

  it('each family bumps at most 1 per call', () => {
    const state = createSessionState();
    bumpCounters(state, [], 'our secret, just between us, do not tell anyone');
    expect(state.counters.secrecy).toBe(1);
  });

  it('neutral game text bumps nothing', () => {
    const state = createSessionState();
    bumpCounters(state, [], 'make the zombie die when you hit it');
    expect(state.counters).toEqual({ secrecy: 0, affection: 0, piiProbes: 0, platformMoves: 0 });
  });
});

describe('grooming escalation', () => {
  it('stays calm below the thresholds', () => {
    const state = createSessionState();
    bumpCounters(state, [], 'our little secret');
    expect(groomingEscalation(state)).toBe(false);
    bumpCounters(state, [], 'what school do you go to');
    expect(groomingEscalation(state)).toBe(false);
  });

  it('escalates when one counter reaches 2', () => {
    const state = createSessionState();
    bumpCounters(state, [], "don't tell your parents");
    bumpCounters(state, [], 'keep it a secret, okay');
    expect(groomingEscalation(state)).toBe(true);
  });

  it('escalates when the total reaches 3 across families', () => {
    const state = createSessionState();
    bumpCounters(state, [], 'our little secret');
    bumpCounters(state, [], 'what is your real name');
    bumpCounters(state, [], 'add me on instagram');
    expect(groomingEscalation(state)).toBe(true);
  });

  it('a cumulative drip of category hits escalates too', () => {
    const state = createSessionState();
    bumpCounters(state, ['grooming'], '');
    expect(groomingEscalation(state)).toBe(false);
    bumpCounters(state, ['grooming'], '');
    expect(groomingEscalation(state)).toBe(true);
  });
});
