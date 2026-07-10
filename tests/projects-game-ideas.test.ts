import { describe, expect, it } from 'vitest';
import {
  GAME_IDEA_COUNT,
  GAME_IDEAS,
  gameIdeaById,
  gameIdeaMenuOptions,
  isOwnIdea,
} from '../src/projects/gameIdeas.js';
import { DASH_RE, fkGrade } from './ui-fk.js';

describe('game idea bank', () => {
  it('has Build my own idea first, then exactly 30 games (31 total)', () => {
    expect(GAME_IDEA_COUNT).toBe(31);
    expect(GAME_IDEAS).toHaveLength(31);
    expect(GAME_IDEAS[0]?.id).toBe('own');
    expect(GAME_IDEAS[0]?.label).toBe('Build my own idea');
    expect(isOwnIdea(GAME_IDEAS[0]!)).toBe(true);
    const games = GAME_IDEAS.filter((g) => !isOwnIdea(g));
    expect(games).toHaveLength(30);
  });

  it('has unique ids and labels', () => {
    const ids = GAME_IDEAS.map((g) => g.id);
    const labels = GAME_IDEAS.map((g) => g.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('seeds are local HTML games without image generation', () => {
    for (const idea of GAME_IDEAS) {
      if (isOwnIdea(idea)) {
        expect(idea.seedPrompt).toBe('');
        continue;
      }
      expect(idea.seedPrompt.length).toBeGreaterThan(20);
      expect(idea.seedPrompt).not.toMatch(/image gen|dall-?e|midjourney|stable diffusion/i);
      expect(idea.seedPrompt).not.toMatch(/download an app|install unity|native app/i);
    }
  });

  it('menu options preserve order and first entry', () => {
    const menu = gameIdeaMenuOptions();
    expect(menu).toHaveLength(31);
    expect(menu[0]?.value).toBe('own');
    expect(menu[0]?.label).toBe('Build my own idea');
    expect(gameIdeaById('dodge-rain')?.label).toBe('Dodge the rain');
  });

  it('kid-facing labels pass reading level and dash rules', () => {
    for (const idea of GAME_IDEAS) {
      expect(idea.label, idea.id).not.toMatch(DASH_RE);
      expect(idea.blurb, idea.id).not.toMatch(DASH_RE);
      expect(fkGrade(idea.blurb), idea.id).toBeLessThanOrEqual(6.5);
    }
  });
});
