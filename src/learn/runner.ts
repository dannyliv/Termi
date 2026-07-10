/**
 * Learn mode runner: the lesson menu, lesson playback, and progress.
 *
 * Everything here is scripted and offline: no model calls, no network.
 * Progress lives in a small JSON file at TERMI_HOME/learn.json. Finished
 * lessons earn a badge once and stay replayable forever. Every prompt is
 * cancel-safe: Ctrl+C exits kindly without marking the lesson complete.
 */

import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { atomicWriteFileSync, termiHome } from '../config/paths.js';
import { awardBadge } from '../surfaces/home.js';
import { celebrate } from '../ui/celebrate.js';
import { mascot, type MascotExpression } from '../ui/mascot.js';
import { glyph, style } from '../ui/theme.js';
import { gradePrompt, LESSONS, type Lesson, type LessonStep } from './lessons.js';

/** Where the finished-lesson list lives. */
export function learnFilePath(): string {
  return path.join(termiHome(), 'learn.json');
}

export interface LearnProgress {
  completed: string[];
}

/** The finished lesson ids, oldest first. Missing or broken file means none. */
export function loadProgress(): LearnProgress {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(learnFilePath(), 'utf8'));
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const completed = (parsed as { completed?: unknown }).completed;
      if (Array.isArray(completed)) {
        return { completed: completed.filter((id): id is string => typeof id === 'string') };
      }
    }
  } catch {
    // No file yet means no lessons finished yet.
  }
  return { completed: [] };
}

/** Records a finished lesson. Repeat finishes change nothing. */
export function markLessonDone(id: string): void {
  const progress = loadProgress();
  if (progress.completed.includes(id)) {
    return;
  }
  progress.completed.push(id);
  atomicWriteFileSync(learnFilePath(), JSON.stringify(progress, null, 2));
}

/** Menu line for one lesson, with a done mark once it is finished. */
export function lessonMenuLabel(lesson: Lesson, done: boolean): string {
  const base = `${lesson.emoji} ${lesson.title}`;
  return done ? `${base} ${glyph('check')}` : base;
}

type Say = (text: string) => void;

function defaultSay(text: string): void {
  console.log(text);
}

const SAY_FACES: readonly MascotExpression[] = ['happy', 'thinking', 'building'];

function kindStop(say: Say): void {
  say([mascot('gentleNo'), '', 'Okay, we can stop here. Come back any time!'].join('\n'));
}

async function runChoiceStep(
  step: Extract<LessonStep, { kind: 'choice' }>,
  say: Say,
): Promise<boolean> {
  const pick = await p.select<number>({
    message: step.question,
    options: step.options.map((option, index) => ({ value: index, label: option.label })),
  });
  if (p.isCancel(pick)) {
    return false;
  }
  const chosen = step.options[pick];
  if (chosen !== undefined) {
    const right = chosen.correct === true;
    const mark = right ? glyph('check') : glyph('bulb');
    const paint = right ? style.good : style.warm;
    say(paint(`${mark} ${chosen.feedback}`));
  }
  return true;
}

async function runGradeStep(
  step: Extract<LessonStep, { kind: 'grade' }>,
  say: Say,
): Promise<boolean> {
  const pick = await p.select<string>({
    message: `Grade this prompt: "${step.prompt}"`,
    options: [
      { value: 'good', label: 'Super prompt' },
      { value: 'bad', label: 'Needs work' },
    ],
  });
  if (p.isCancel(pick)) {
    return false;
  }
  const right = (pick === 'good') === step.isGood;
  say(
    right
      ? style.good(`${glyph('check')} You got it! ${step.why}`)
      : style.warm(`${glyph('bulb')} Look again. ${step.why}`),
  );
  return true;
}

/**
 * Lesson two's free-type finale: the kid writes a prompt and the
 * rule-based grader answers with kind tips. No model call, ever.
 * Returns false only when the kid cancels.
 */
export async function runPromptPractice(say: Say = defaultSay): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const typed = await p.text({
      message: 'Your turn! Write your own super prompt.',
      placeholder: 'make the player a red dragon',
    });
    if (p.isCancel(typed)) {
      return false;
    }
    const grade = gradePrompt(typed ?? '');
    if (grade.good) {
      say(style.good(`${glyph('check')} That is a super prompt! Save it for your next build.`));
      return true;
    }
    say(style.warm('Close! A tip or two:'));
    for (const tip of grade.tips) {
      say(`  ${glyph('bulb')} ${tip}`);
    }
    if (attempt === 0) {
      say('One more try. You have got this.');
    }
  }
  say('Good practice! Super prompts take a few tries.');
  return true;
}

/**
 * Plays one lesson start to finish. Returns true when the kid reached the
 * end. The badge and the done mark only land on a full play-through.
 */
export async function runLesson(lesson: Lesson, say: Say = defaultSay): Promise<boolean> {
  say([mascot('happy'), '', style.title(`${lesson.emoji} ${lesson.title}`), lesson.intro].join('\n'));
  let sayCount = 0;
  for (const step of lesson.steps) {
    if (step.kind === 'say') {
      const face = SAY_FACES[sayCount % SAY_FACES.length] ?? 'happy';
      sayCount += 1;
      say([mascot(face), '', step.text].join('\n'));
    } else if (step.kind === 'choice') {
      if (!(await runChoiceStep(step, say))) {
        kindStop(say);
        return false;
      }
    } else if (step.kind === 'grade') {
      if (!(await runGradeStep(step, say))) {
        kindStop(say);
        return false;
      }
    } else {
      if (lesson.id === 'learn-2' && !(await runPromptPractice(say))) {
        kindStop(say);
        return false;
      }
      p.note(step.text, 'Your mission');
    }
  }
  say(celebrate(`Lesson done: ${lesson.title}!`));
  markLessonDone(lesson.id);
  await awardBadge(lesson.id, say);
  return true;
}

/**
 * The learn menu: all six lessons with done marks, replay welcome.
 * Loops until the kid picks the exit row or cancels.
 */
export async function runLearnMenu(): Promise<void> {
  console.log(mascot('happy'));
  console.log('Learn AI: six tiny lessons on how to prompt. Zero homework.');
  for (;;) {
    const done = new Set(loadProgress().completed);
    const options = [
      ...LESSONS.map((lesson) => ({
        value: lesson.id,
        label: lessonMenuLabel(lesson, done.has(lesson.id)),
        ...(done.has(lesson.id) ? { hint: 'Done! Play it again any time.' } : {}),
      })),
      { value: '__back__', label: 'All done for now' },
    ];
    const firstOpen = LESSONS.find((lesson) => !done.has(lesson.id));
    const pick = await p.select<string>({
      message: 'Pick a lesson.',
      options,
      initialValue: firstOpen !== undefined ? firstOpen.id : '__back__',
    });
    if (p.isCancel(pick) || pick === '__back__') {
      console.log('Come back any time. The lessons never run out.');
      return;
    }
    const lesson = LESSONS.find((entry) => entry.id === pick);
    if (lesson !== undefined) {
      await runLesson(lesson);
    }
  }
}
