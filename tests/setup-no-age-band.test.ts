import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { helpText } from '../src/surfaces/commands.js';
import { T } from '../src/ui/text.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('setup has no under/over 13 choice', () => {
  it('wizard source does not present age band options', () => {
    const wizard = fs.readFileSync(path.join(root, 'src/setup/wizard.ts'), 'utf8');
    expect(wizard).not.toMatch(/Under 13/);
    expect(wizard).not.toMatch(/13 or older/);
    expect(wizard).not.toMatch(/How old is your kid/);
    expect(wizard).toMatch(/one safety bar for every age|one safety bar for all ages/);
  });

  it('SAFETY.md does not claim age-band attestation in setup', () => {
    const safety = fs.readFileSync(path.join(root, 'SAFETY.md'), 'utf8');
    expect(safety).not.toMatch(/attest to your kid's age band/i);
    expect(safety).toMatch(/one safety bar for every age/i);
  });

  it('local guard step always enables classifier install', () => {
    const wizard = fs.readFileSync(path.join(root, 'src/setup/wizard.ts'), 'utf8');
    expect(wizard).toMatch(/localClassifier: true/);
    expect(wizard).toMatch(/ensureGuardFetch/);
    // Decline path that turns classifier off must not exist.
    expect(wizard).not.toMatch(/localClassifier: false/);
  });
});

describe('/new routes to Build a game, not stock scaffolds', () => {
  it('openChatLoop source calls runBuildGame on exit new', () => {
    const home = fs.readFileSync(path.join(root, 'src/surfaces/home.ts'), 'utf8');
    // After chat returns 'new', Build a game is the only create path.
    expect(home).toMatch(/exit !== 'new'/);
    expect(home).toMatch(/runBuildGame/);
    // The next project after /new must not come from runNewProject.
    const afterNew = home.slice(home.indexOf("exit !== 'new'"));
    const block = afterNew.slice(0, 500);
    expect(block).toMatch(/runBuildGame/);
    expect(block).not.toMatch(/runNewProject/);
  });

  it('help and tip copy steer kids to build a game', () => {
    const text = helpText();
    expect(text).toContain('/new');
    expect(text).toMatch(/build a new game/i);
    expect(text).not.toMatch(/start a fresh project/i);
    expect(T.hints.some((h) => /build a new game/i.test(h))).toBe(true);
    expect(T.hints.every((h) => !/start something fresh/i.test(h))).toBe(true);
  });
});
