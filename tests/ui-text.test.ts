import { describe, expect, it } from 'vitest';
import { T } from '../src/ui/text.js';
import { collectStrings, DASH_RE, fkGrade, maxSentenceWords, splitWords } from './ui-fk.js';

const leaves = collectStrings(T);

describe('kid copy registry', () => {
  it('has every required group', () => {
    expect(Object.keys(T)).toEqual(
      expect.arrayContaining([
        'home',
        'wizard',
        'chat',
        'blocks',
        'selfHarmSupport',
        'errors',
        'offline',
        'quota',
        'grownups',
        'hints',
        'celebrations',
      ]),
    );
  });

  it('reads at grade 6.5 or below for every string', () => {
    for (const { path, text } of leaves) {
      if (splitWords(text).length < 3) continue;
      const grade = fkGrade(text);
      expect(grade, `${path}: "${text}" scored grade ${grade.toFixed(1)}`).toBeLessThanOrEqual(6.5);
    }
  });

  it('keeps every sentence under 15 words', () => {
    for (const { path, text } of leaves) {
      expect(maxSentenceWords(text), `${path}: "${text}"`).toBeLessThan(15);
    }
  });

  it('contains no em-dash, en-dash, or lookalike dashes', () => {
    for (const { path, text } of leaves) {
      expect(DASH_RE.test(text), `${path}: "${text}"`).toBe(false);
    }
  });

  it('covers every safety category with a block message', () => {
    const categories = [
      'sexual',
      'self_harm',
      'violence',
      'hate_harassment',
      'illicit',
      'profanity',
      'pii',
      'grooming',
      'adult_advice',
      'jailbreak',
    ] as const;
    for (const category of categories) {
      const message = T.blocks.byCategory[category];
      expect(message.length, category).toBeGreaterThan(10);
    }
  });

  it('keeps the self-harm support message calm and pointed at real help', () => {
    const message = T.selfHarmSupport.message;
    expect(message).toContain('trusted adult');
    expect(message).toContain('988');
    expect(message).toContain('You are not alone');
  });

  it('discloses that Termi is an AI tool, not a person', () => {
    expect(T.wizard.aiDisclosure).toContain('an AI');
    expect(T.wizard.aiDisclosure).toContain('not a person');
  });

  it('explains quota with a reset time and a still-works list', () => {
    expect(T.quota.message).toContain('{time}');
    expect(T.quota.message).toContain('energy');
    expect(T.quota.stillWorks.length).toBeGreaterThanOrEqual(3);
  });

  it('has a did-you-mean template with a command slot', () => {
    expect(T.chat.didYouMean).toContain('{command}');
  });

  it('has hint bar entries for the core commands', () => {
    const joined = T.hints.join(' ');
    for (const command of ['/preview', '/undo', '/ideas', '/help']) {
      expect(joined).toContain(command);
    }
  });

  it('never echoes blocked content in block messages', () => {
    const all = [...Object.values(T.blocks.byCategory), T.blocks.generic];
    for (const message of all) {
      expect(message).not.toContain('{');
    }
  });
});
