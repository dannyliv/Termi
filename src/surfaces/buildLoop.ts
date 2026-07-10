/**
 * Pure helpers for the Build a game prompt loop.
 * UI and network live in buildGame.ts; tests cover this module fully.
 */

import type { GameIdea } from '../projects/gameIdeas.js';
import { isOwnIdea } from '../projects/gameIdeas.js';

export type PromptPath = 'write' | 'help';
export type DoneChoice = 'done' | 'improve';

/** Clarifying questions when the kid picks Help me with a prompt. */
export function helpQuestions(idea: GameIdea): string[] {
  if (isOwnIdea(idea)) {
    return [
      'What is your game about in one short line?',
      'How does the player win or finish?',
      'What keys or clicks should control it?',
    ];
  }
  return [
    `What should feel special about "${idea.label}"?`,
    'Do you want easy mode, normal, or hard?',
  ];
}

/** Builds a starter prompt from a catalog idea (not own-idea). */
export function seedPromptForIdea(idea: GameIdea): string {
  if (isOwnIdea(idea) || idea.seedPrompt.trim().length === 0) {
    return '';
  }
  return idea.seedPrompt.trim();
}

/**
 * Turns help-question answers into a suggested build prompt the kid can
 * edit. Works offline without a model call.
 */
export function suggestPromptFromAnswers(idea: GameIdea, answers: string[]): string {
  const cleaned = answers.map((a) => a.trim()).filter((a) => a.length > 0);
  if (isOwnIdea(idea)) {
    const about = cleaned[0] ?? 'a fun browser game';
    const win = cleaned[1] ?? 'reach a high score';
    const controls = cleaned[2] ?? 'arrow keys or click';
    return (
      `Make a complete local browser game about ${about}. ` +
      `The player wins when they ${win}. ` +
      `Controls: ${controls}. ` +
      `Use only HTML, CSS, and JavaScript in index.html, style.css, and game.js. ` +
      `No images from the internet. Keep it kid friendly and playable after one load.`
    );
  }
  const special = cleaned[0] ?? idea.blurb;
  const difficulty = cleaned[1] ?? 'normal';
  const base = seedPromptForIdea(idea) || `Make a ${idea.label} browser game.`;
  return (
    `${base} ` +
    `Make it feel special by: ${special}. ` +
    `Difficulty: ${difficulty}. ` +
    `Use only HTML, CSS, and JavaScript files. No outside images.`
  );
}

/** Final polish instruction after the kid says they are done. */
export function polishPrompt(projectSummary: string): string {
  const summary =
    projectSummary.trim().length > 0
      ? projectSummary.trim().slice(0, 800)
      : 'the current game files';
  return (
    `You are doing final testing and fixes for this kid game. ` +
    `Read the project files. Based on ${summary}, make ONE clear improvement ` +
    `so the game feels more complete (for example a start screen, score, ` +
    `restart key, win or lose message, or clearer controls). ` +
    `Apply the change in the files. Keep it simple and kid friendly. ` +
    `No internet images. Then briefly say what you fixed.`
  );
}

/** Summarize kid files for the polish prompt (pure). */
export function summarizeProjectFiles(
  files: { relPath: string; content: string }[],
): string {
  if (files.length === 0) {
    return 'no files yet';
  }
  return files
    .map((f) => {
      const lines = f.content.split('\n').length;
      const hasCanvas = /canvas/i.test(f.content);
      const hasScore = /score/i.test(f.content);
      const flags = [
        hasCanvas ? 'canvas' : null,
        hasScore ? 'score' : null,
        lines < 20 ? 'short' : null,
      ]
        .filter(Boolean)
        .join(',');
      return `${f.relPath}(${lines} lines${flags ? `; ${flags}` : ''})`;
    })
    .join('; ');
}

/** Maps select values to done/improve. */
export function parseDoneChoice(value: string): DoneChoice | null {
  if (value === 'done' || value === 'improve') {
    return value;
  }
  return null;
}

/** Default project name from an idea label. */
export function defaultNameForIdea(idea: GameIdea): string {
  if (isOwnIdea(idea)) {
    return 'My Game';
  }
  return idea.label;
}

/**
 * One completeness suggestion line for the terminal (before the kid
 * approves a polish apply). Pure heuristic from file summary text.
 */
export function completenessHint(summary: string): string {
  const s = summary.toLowerCase();
  if (!s.includes('score')) {
    return 'Add a clear score the player can see.';
  }
  if (!s.includes('canvas') && !s.includes('button')) {
    return 'Add a start screen with a Play button.';
  }
  if (s.includes('short')) {
    return 'Add a win or lose message and a restart key.';
  }
  return 'Add clearer control hints on the start screen.';
}
