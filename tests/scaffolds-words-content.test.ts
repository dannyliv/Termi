/**
 * Deep content checks for the "words" scaffolds. The kid-editable data
 * blocks are emitted as JSON-shaped literals, so tests extract and parse
 * them to verify story graphs, quiz data, and dialog tables.
 */

import { describe, expect, it } from 'vitest';
import { storiesScaffold } from '../src/projects/scaffolds/stories.js';
import { quizzesScaffold } from '../src/projects/scaffolds/quizzes.js';
import { websitesScaffold } from '../src/projects/scaffolds/websites.js';
import { charactersScaffold } from '../src/projects/scaffolds/characters.js';

/**
 * Extracts `const <name> = <object-or-array>` from generated JS by bracket
 * matching (string-aware), then parses it as JSON. Our generators emit the
 * data blocks with JSON.stringify, so this is lossless.
 */
function extractConst(src: string, name: string): unknown {
  const marker = `const ${name} = `;
  const start = src.indexOf(marker);
  if (start === -1) {
    throw new Error(`const ${name} not found`);
  }
  const open = start + marker.length;
  const openChar = src[open];
  if (openChar !== '{' && openChar !== '[') {
    throw new Error(`const ${name} is not an object or array literal`);
  }
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '"') {
      i += 1;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') {
          i += 1;
        }
        i += 1;
      }
      continue;
    }
    if (ch === openChar) {
      depth += 1;
    } else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(src.slice(open, i + 1));
      }
    }
  }
  throw new Error(`const ${name} has unbalanced brackets`);
}

function gameJs(scaffold: typeof storiesScaffold, themeIndex: number): string {
  const theme = scaffold.themes[themeIndex]!;
  return scaffold.files(theme, 'Test Project')['game.js'] ?? '';
}

interface StoryChoice {
  label: string;
  goto: string;
  needs?: string;
}
interface StoryScene {
  id: string;
  text: string;
  gives?: string;
  choices: StoryChoice[];
}
interface StoryData {
  start: string;
  scenes: StoryScene[];
}

describe('stories: Story Quest', () => {
  it.each([0, 1])('theme %i ships a sound 8-12 scene story graph', (themeIndex) => {
    const js = gameJs(storiesScaffold, themeIndex);
    const story = extractConst(js, 'STORY') as StoryData;

    expect(story.scenes.length).toBeGreaterThanOrEqual(8);
    expect(story.scenes.length).toBeLessThanOrEqual(12);

    const ids = story.scenes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(story.start);

    for (const scene of story.scenes) {
      expect(scene.text.length).toBeGreaterThan(20);
      for (const choice of scene.choices) {
        expect(choice.label.length).toBeGreaterThan(0);
        expect(ids).toContain(choice.goto);
      }
      if (scene.choices.length > 0) {
        expect(scene.choices.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it.each([0, 1])('theme %i has exactly 3 endings, all reachable', (themeIndex) => {
    const js = gameJs(storiesScaffold, themeIndex);
    const story = extractConst(js, 'STORY') as StoryData;
    const endings = story.scenes.filter((s) => s.choices.length === 0);
    expect(endings).toHaveLength(3);

    // BFS over the choice graph from the start scene.
    const byId = new Map(story.scenes.map((s) => [s.id, s]));
    const seen = new Set<string>([story.start]);
    const queue = [story.start];
    while (queue.length > 0) {
      const scene = byId.get(queue.shift()!)!;
      for (const choice of scene.choices) {
        if (!seen.has(choice.goto)) {
          seen.add(choice.goto);
          queue.push(choice.goto);
        }
      }
    }
    for (const scene of story.scenes) {
      expect(seen.has(scene.id)).toBe(true);
    }
  });

  it.each([0, 1])('theme %i wires one item to one locked path', (themeIndex) => {
    const js = gameJs(storiesScaffold, themeIndex);
    const story = extractConst(js, 'STORY') as StoryData;
    const given = story.scenes.filter((s) => s.gives).map((s) => s.gives as string);
    const needed = story.scenes
      .flatMap((s) => s.choices)
      .filter((c) => c.needs)
      .map((c) => c.needs as string);
    expect(given.length).toBeGreaterThanOrEqual(1);
    expect(needed.length).toBeGreaterThanOrEqual(1);
    for (const need of needed) {
      expect(given).toContain(need);
    }
  });

  it('tracks endings in localStorage', () => {
    const js = gameJs(storiesScaffold, 0);
    expect(js).toContain('localStorage');
    expect(js).toContain('endings!');
  });
});

interface TriviaQuestion {
  q: string;
  answers: string[];
  correct: number;
  fact: string;
}
interface PersonalityQuestion {
  q: string;
  answers: { text: string; character: string }[];
}
type QuizCharacters = Record<string, { name: string; emoji: string; line: string }>;

describe('quizzes: Quiz Show', () => {
  const expectedTypes: Record<string, string> = {
    animals: 'trivia',
    'which-character': 'personality',
  };

  it.each([0, 1])('theme %i sets the right QUIZ_TYPE default', (themeIndex) => {
    const theme = quizzesScaffold.themes[themeIndex]!;
    const js = gameJs(quizzesScaffold, themeIndex);
    const match = /const QUIZ_TYPE = "(\w+)";/.exec(js);
    expect(match?.[1]).toBe(expectedTypes[theme.id]);
  });

  it.each([0, 1])('theme %i ships valid data for BOTH modes', (themeIndex) => {
    const js = gameJs(quizzesScaffold, themeIndex);
    const trivia = extractConst(js, 'TRIVIA_QUESTIONS') as TriviaQuestion[];
    const personality = extractConst(js, 'PERSONALITY_QUESTIONS') as PersonalityQuestion[];
    const characters = extractConst(js, 'CHARACTERS') as QuizCharacters;

    expect(trivia.length).toBeGreaterThanOrEqual(6);
    for (const q of trivia) {
      expect(q.q.length).toBeGreaterThan(5);
      expect(q.answers.length).toBeGreaterThanOrEqual(3);
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(q.answers.length);
      expect(q.fact.length).toBeGreaterThan(5);
    }

    const characterIds = Object.keys(characters);
    expect(characterIds.length).toBeGreaterThanOrEqual(3);
    for (const c of Object.values(characters)) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.emoji.length).toBeGreaterThan(0);
      expect(c.line.length).toBeGreaterThan(0);
    }

    expect(personality.length).toBeGreaterThanOrEqual(5);
    const used = new Set<string>();
    for (const q of personality) {
      expect(q.answers.length).toBeGreaterThanOrEqual(3);
      for (const a of q.answers) {
        expect(characterIds).toContain(a.character);
        used.add(a.character);
      }
    }
    // Every character is winnable.
    expect([...used].sort()).toEqual(characterIds.sort());
  });

  it('gives kind end-of-quiz copy', () => {
    const js = gameJs(quizzesScaffold, 0);
    expect(js).toContain('Good try!');
    expect(js).toContain('Perfect round!');
  });
});

describe('websites: My Page', () => {
  it.each([0, 1])('theme %i edits in the page itself, never via chat', (themeIndex) => {
    const theme = websitesScaffold.themes[themeIndex]!;
    const files = websitesScaffold.files(theme, 'Test Page');
    const html = files['index.html'] ?? '';
    const js = files['game.js'] ?? '';

    expect(html).toContain('contenteditable="true"');
    expect(js).toContain('localStorage');
    // The built-in safety tip is part of the page, not themeable away.
    expect(html).toContain('Use your nickname. Keep your real name, school, and address secret.');
    // Emoji avatars only. No photo uploads.
    expect(html).not.toContain('type="file"');
    expect(js).not.toContain('type="file"');
  });

  it.each([0, 1])('theme %i ships avatars and favorites lists', (themeIndex) => {
    const js = gameJs(websitesScaffold, themeIndex);
    const avatars = extractConst(js, 'AVATARS') as string[];
    const favorites = extractConst(js, 'FAVORITES') as string[];
    expect(avatars.length).toBeGreaterThanOrEqual(8);
    expect(favorites.length).toBeGreaterThanOrEqual(4);
    for (const label of favorites) {
      expect(label.length).toBeGreaterThan(2);
    }
  });
});

interface DialogEntry {
  keywords: string[];
  reply: string;
  mood?: string;
}
interface CharacterSpec {
  name: string;
  role: string;
  greeting: string;
  catchphrases: string[];
  moods: Record<string, string>;
}

describe('characters: Talking Character', () => {
  it.each([0, 1])('theme %i ships 12+ starter replies with personality', (themeIndex) => {
    const js = gameJs(charactersScaffold, themeIndex);
    const dialog = extractConst(js, 'DIALOG') as DialogEntry[];
    const fallbacks = extractConst(js, 'FALLBACKS') as string[];

    expect(dialog.length).toBeGreaterThanOrEqual(10);
    expect(dialog.length + fallbacks.length).toBeGreaterThanOrEqual(12);
    expect(fallbacks.length).toBeGreaterThanOrEqual(3);

    for (const entry of dialog) {
      expect(entry.keywords.length).toBeGreaterThanOrEqual(1);
      for (const kw of entry.keywords) {
        // Lowercase alphanumeric so the engine's normalizer always matches.
        expect(kw).toMatch(/^[a-z0-9 ]+$/);
      }
      expect(entry.reply.length).toBeGreaterThan(5);
    }
  });

  it.each([0, 1])('theme %i defines a character with moods and catchphrases', (themeIndex) => {
    const js = gameJs(charactersScaffold, themeIndex);
    const character = extractConst(js, 'CHARACTER') as CharacterSpec;
    const dialog = extractConst(js, 'DIALOG') as DialogEntry[];

    expect(character.name.length).toBeGreaterThan(0);
    expect(character.greeting.length).toBeGreaterThan(10);
    expect(character.catchphrases.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(character.moods).length).toBeGreaterThanOrEqual(3);
    // Every mood referenced by the dialog table exists.
    for (const entry of dialog) {
      if (entry.mood) {
        expect(Object.keys(character.moods)).toContain(entry.mood);
      }
    }
  });

  it.each([0, 1])('theme %i frames the character as built, not a friend', (themeIndex) => {
    const js = gameJs(charactersScaffold, themeIndex);
    expect(js).toContain('you built');
    // No AI at runtime: the engine is a keyword table, nothing else.
    expect(js).not.toMatch(/\bfetch\s*\(/);
    expect(js).toContain('const DIALOG');
  });
});
