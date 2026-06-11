import { describe, expect, it } from 'vitest';
import { getIdeas } from '../src/projects/ideas.js';
import { scaffolds } from '../src/projects/scaffolds/index.js';

describe('getIdeas', () => {
  for (const scaffold of scaffolds) {
    it(`has a curated list for ${scaffold.id}`, () => {
      const ideas = getIdeas(scaffold.id);
      expect(ideas.length).toBeGreaterThanOrEqual(8);
      expect(ideas.length).toBeLessThanOrEqual(10);
      for (const idea of ideas) {
        expect(typeof idea).toBe('string');
        expect(idea.trim().length).toBeGreaterThan(0);
      }
    });
  }

  it('falls back to a generic list for unknown ids', () => {
    const ideas = getIdeas('mystery-scaffold');
    expect(ideas.length).toBeGreaterThanOrEqual(8);
    expect(ideas.length).toBeLessThanOrEqual(10);
    expect(getIdeas('')).toEqual(ideas);
  });

  it('keeps every idea short and dash free', () => {
    const all = [...scaffolds.map((s) => s.id), 'unknown'].flatMap((id) => getIdeas(id));
    for (const idea of all) {
      expect(idea.split(/\s+/).length).toBeLessThanOrEqual(15);
      expect(idea).not.toMatch(/[\u2010-\u2015\u2212]/);
    }
  });

  it('returns a fresh copy each call', () => {
    const first = getIdeas('games');
    first.push('mutated');
    expect(getIdeas('games')).not.toContain('mutated');
  });
});
