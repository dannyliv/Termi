import { describe, expect, it } from 'vitest';
import { GAME_IDEAS } from '../src/projects/gameIdeas.js';
import {
  completenessHint,
  defaultNameForIdea,
  helpQuestions,
  parseDoneChoice,
  polishPrompt,
  seedPromptForIdea,
  suggestPromptFromAnswers,
  summarizeProjectFiles,
} from '../src/surfaces/buildLoop.js';
import {
  buildGameFirstLabel,
  buildGameIdeaCount,
  buildGameIsOwnFirst,
} from '../src/surfaces/buildGame.js';
import { homeMenuOptions } from '../src/surfaces/home.js';
import { T } from '../src/ui/text.js';

describe('build loop helpers', () => {
  const own = GAME_IDEAS[0]!;
  const catalog = GAME_IDEAS[1]!;

  it('asks more questions for own idea than catalog ideas', () => {
    expect(helpQuestions(own).length).toBe(3);
    expect(helpQuestions(catalog).length).toBe(2);
  });

  it('suggests a prompt from own-idea answers without a model', () => {
    const prompt = suggestPromptFromAnswers(own, [
      'a cat catching yarn',
      'catch 10 balls',
      'arrow keys',
    ]);
    expect(prompt.toLowerCase()).toContain('cat');
    expect(prompt.toLowerCase()).toContain('html');
    expect(prompt).not.toMatch(/image gen/i);
  });

  it('uses seed prompt for catalog ideas', () => {
    expect(seedPromptForIdea(own)).toBe('');
    expect(seedPromptForIdea(catalog).length).toBeGreaterThan(10);
  });

  it('polish prompt asks for one completeness fix', () => {
    const p = polishPrompt('game.js short; no score');
    expect(p.toLowerCase()).toContain('one');
    expect(p.toLowerCase()).toMatch(/improv|fix|complete/);
  });

  it('parses done vs improve', () => {
    expect(parseDoneChoice('done')).toBe('done');
    expect(parseDoneChoice('improve')).toBe('improve');
    expect(parseDoneChoice('maybe')).toBeNull();
  });

  it('summarizes files and hints completeness', () => {
    const summary = summarizeProjectFiles([
      { relPath: 'game.js', content: 'const x = 1;\n'.repeat(5) },
    ]);
    expect(summary).toContain('game.js');
    expect(completenessHint(summary).length).toBeGreaterThan(5);
  });

  it('default names', () => {
    expect(defaultNameForIdea(own)).toBe('My Game');
    expect(defaultNameForIdea(catalog)).toBe(catalog.label);
  });
});

describe('build game surface wiring', () => {
  it('exposes 31 ideas with own first', () => {
    expect(buildGameIdeaCount()).toBe(31);
    expect(buildGameIsOwnFirst()).toBe(true);
    expect(buildGameFirstLabel()).toBe('Build my own idea');
  });
});

describe('simplified home menu', () => {
  it('includes Build a game and Learn AI', () => {
    const opts = homeMenuOptions(false, false);
    const labels = opts.map((o) => o.label);
    const values = opts.map((o) => o.value);
    expect(labels).toContain(T.home.menuBuild);
    expect(labels).toContain(T.home.menuLearn);
    expect(values).toContain('build');
    expect(values).toContain('learn');
    expect(values).not.toContain('ideas');
    expect(values).not.toContain('badges');
    expect(values).not.toContain('new');
  });

  it('adds continue when a last project exists', () => {
    const opts = homeMenuOptions(true, true);
    expect(opts.some((o) => o.value === 'continue')).toBe(true);
    expect(opts[0]?.value).toBe('continue');
  });
});
