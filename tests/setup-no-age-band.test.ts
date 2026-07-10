import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('setup has no under/over 13 choice', () => {
  it('wizard source does not present age band options', () => {
    const wizard = fs.readFileSync(path.join(root, 'src/setup/wizard.ts'), 'utf8');
    expect(wizard).not.toMatch(/Under 13/);
    expect(wizard).not.toMatch(/13 or older/);
    expect(wizard).not.toMatch(/How old is your kid/);
    expect(wizard).toMatch(/one safety bar for every age|one safety bar for all ages/);
  });

  it('local guard step always enables classifier install', () => {
    const wizard = fs.readFileSync(path.join(root, 'src/setup/wizard.ts'), 'utf8');
    expect(wizard).toMatch(/localClassifier: true/);
    expect(wizard).toMatch(/ensureGuardFetch/);
    // Decline path that turns classifier off must not exist.
    expect(wizard).not.toMatch(/localClassifier: false/);
  });
});
