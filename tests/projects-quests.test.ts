import { describe, expect, it } from 'vitest';
import { QUESTS, questById, questsFor, questStepLine } from '../src/projects/quests.js';
import { scaffolds } from '../src/projects/scaffolds/index.js';
import { DASH_RE, fkGrade, maxSentenceWords } from './ui-fk.js';

describe('quest registry', () => {
  it('covers every scaffold with at least one quest', () => {
    for (const scaffold of scaffolds) {
      expect(questsFor(scaffold.id).length, scaffold.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('points every quest at a real scaffold', () => {
    const ids = new Set(scaffolds.map((s) => s.id));
    for (const quest of QUESTS) {
      expect(ids.has(quest.scaffoldId), quest.id).toBe(true);
    }
  });

  it('has unique ids and titles', () => {
    const ids = QUESTS.map((q) => q.id);
    const titles = QUESTS.map((q) => q.title);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('keeps every quest a short, complete trail', () => {
    for (const quest of QUESTS) {
      expect(quest.steps.length, quest.id).toBeGreaterThanOrEqual(3);
      expect(quest.steps.length, quest.id).toBeLessThanOrEqual(6);
      expect(quest.emoji.length, quest.id).toBeGreaterThan(0);
      for (const step of quest.steps) {
        expect(step.say.trim().length, quest.id).toBeGreaterThan(0);
        expect(step.prompt.trim().length, quest.id).toBeGreaterThan(0);
      }
    }
  });

  it('keeps all quest copy kid readable and dash free', () => {
    for (const quest of QUESTS) {
      // Termi's own voice (titles and step guidance) meets the reading bar.
      for (const text of [quest.title, ...quest.steps.map((s) => s.say)]) {
        expect(DASH_RE.test(text), `${quest.id}: ${text}`).toBe(false);
        expect(fkGrade(text), `${quest.id}: ${text}`).toBeLessThanOrEqual(6.5);
        expect(maxSentenceWords(text), `${quest.id}: ${text}`).toBeLessThanOrEqual(15);
      }
      // Prompts are kid-sendable chat lines: short and dash free, like /ideas.
      for (const step of quest.steps) {
        expect(DASH_RE.test(step.prompt), `${quest.id}: ${step.prompt}`).toBe(false);
        expect(step.prompt.split(/\s+/).length, `${quest.id}: ${step.prompt}`).toBeLessThanOrEqual(
          15,
        );
      }
    }
  });

  it('keeps every step prompt sendable as one short chat message', () => {
    for (const quest of QUESTS) {
      for (const step of quest.steps) {
        expect(step.prompt.length, quest.id).toBeLessThanOrEqual(120);
        expect(step.prompt.includes('\n'), quest.id).toBe(false);
      }
    }
  });
});

describe('quest lookups', () => {
  it('finds quests by scaffold and by id', () => {
    const gameQuests = questsFor('games');
    expect(gameQuests.length).toBeGreaterThanOrEqual(1);
    const first = gameQuests[0]!;
    expect(questById(first.id)?.id).toBe(first.id);
    expect(questById('quest-nope')).toBeUndefined();
    expect(questsFor('nope')).toEqual([]);
  });

  it('renders a step line with progress and instruction', () => {
    const quest = questsFor('games')[0]!;
    const line = questStepLine(quest, 0);
    expect(line).toContain('Step 1 of ' + String(quest.steps.length));
    expect(line).toContain(quest.steps[0]!.say);
    expect(questStepLine(quest, 99)).toBe('');
  });
});
