import { describe, expect, it } from 'vitest';
import { gradePrompt, LESSONS, PROMPT_GRADER, type LessonStep } from '../src/learn/lessons.js';
import { collectStrings, DASH_RE, fkGrade, maxSentenceWords, splitWords } from './ui-fk.js';

const VALID_KINDS = new Set(['say', 'choice', 'grade', 'mission']);

function stepsOf(lessonId: string): LessonStep[] {
  const lesson = LESSONS.find((entry) => entry.id === lessonId);
  expect(lesson, lessonId).toBeDefined();
  return lesson === undefined ? [] : lesson.steps;
}

describe('lesson data integrity', () => {
  it('ships exactly six lessons with the learn badge ids in order', () => {
    expect(LESSONS.map((lesson) => lesson.id)).toEqual([
      'learn-1',
      'learn-2',
      'learn-3',
      'learn-4',
      'learn-5',
      'learn-6',
    ]);
  });

  it('gives every lesson a title, emoji, intro, and steps', () => {
    for (const lesson of LESSONS) {
      expect(lesson.title.length, lesson.id).toBeGreaterThan(0);
      expect(lesson.emoji.length, lesson.id).toBeGreaterThan(0);
      expect(lesson.intro.length, lesson.id).toBeGreaterThan(0);
      expect(lesson.steps.length, lesson.id).toBeGreaterThan(3);
    }
  });

  it('uses only valid step kinds', () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        expect(VALID_KINDS.has(step.kind), `${lesson.id}: ${step.kind}`).toBe(true);
      }
    }
  });

  it('gives every choice two or more options, all with feedback', () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        if (step.kind !== 'choice') continue;
        expect(step.options.length, `${lesson.id}: ${step.question}`).toBeGreaterThanOrEqual(2);
        for (const option of step.options) {
          expect(option.feedback.length, `${lesson.id}: ${option.label}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('marks exactly one correct option per choice', () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        if (step.kind !== 'choice') continue;
        const correct = step.options.filter((option) => option.correct === true);
        expect(correct.length, `${lesson.id}: ${step.question}`).toBe(1);
      }
    }
  });

  it('ends every lesson with exactly one mission', () => {
    for (const lesson of LESSONS) {
      const missions = lesson.steps.filter((step) => step.kind === 'mission');
      expect(missions.length, lesson.id).toBe(1);
      expect(lesson.steps[lesson.steps.length - 1]?.kind, lesson.id).toBe('mission');
    }
  });

  it('teaches lesson two with four or more grade pairs, both kinds', () => {
    const grades = stepsOf('learn-2').filter(
      (step): step is Extract<LessonStep, { kind: 'grade' }> => step.kind === 'grade',
    );
    expect(grades.length).toBeGreaterThanOrEqual(4);
    expect(grades.some((step) => step.isGood)).toBe(true);
    expect(grades.some((step) => !step.isGood)).toBe(true);
    for (const step of grades) {
      expect(step.prompt.length).toBeGreaterThan(0);
      expect(step.why.length).toBeGreaterThan(0);
    }
  });

  it('keeps the grader and lesson two grade answers in agreement', () => {
    const grades = stepsOf('learn-2').filter(
      (step): step is Extract<LessonStep, { kind: 'grade' }> => step.kind === 'grade',
    );
    for (const step of grades) {
      expect(gradePrompt(step.prompt).good, step.prompt).toBe(step.isGood);
    }
  });
});

describe('lesson copy quality', () => {
  const leaves = collectStrings(LESSONS, 'LESSONS');

  it('collected a healthy amount of copy', () => {
    expect(leaves.length).toBeGreaterThan(80);
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
});

describe('gradePrompt', () => {
  it('passes specific prompts with no tips', () => {
    const good = [
      'make the player a red dragon',
      'change the background in game.js to a night sky',
      'add a score counter at the top of the screen',
      'fix the jump so the player lands on the platform',
      'paint the title screen purple with three stars',
    ];
    for (const text of good) {
      const result = gradePrompt(text);
      expect(result.good, text).toBe(true);
      expect(result.tips, text).toEqual([]);
    }
  });

  it('fails vague or short prompts with kind tips', () => {
    const bad = ['make it better', 'do something cool', 'help', 'fix', 'cooler please'];
    for (const text of bad) {
      const result = gradePrompt(text);
      expect(result.good, text).toBe(false);
      expect(result.tips.length, text).toBeGreaterThanOrEqual(1);
      for (const tip of result.tips) {
        expect(tip.length, text).toBeGreaterThan(0);
        expect(DASH_RE.test(tip), tip).toBe(false);
        expect(maxSentenceWords(tip), tip).toBeLessThan(15);
      }
    }
  });

  it('flags personal info and asks to keep it secret', () => {
    const withPii = [
      'put my phone number 555 123 4567 on my page',
      'my name is danny smith add it to the title',
      'my address is 12 maple street put it on the page',
      'add my email cool.kid@example.com to the page',
      'my school is oakwood put it in the story',
    ];
    for (const text of withPii) {
      const result = gradePrompt(text);
      expect(result.good, text).toBe(false);
      expect(result.tips.join(' '), text).toContain('secret');
    }
  });

  it('exposes the grader on PROMPT_GRADER for lesson two', () => {
    expect(PROMPT_GRADER.gradePrompt('make the title blue and bigger').good).toBe(true);
    expect(PROMPT_GRADER.gradePrompt('nice').good).toBe(false);
  });
});
