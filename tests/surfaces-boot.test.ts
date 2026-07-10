import { describe, expect, it } from 'vitest';
import { cliHelp, decideBoot } from '../src/cli.js';

describe('decideBoot', () => {
  it('runs the wizard on a true first run', () => {
    expect(decideBoot({ firstRun: true, tampered: false, setupComplete: false })).toEqual({
      warnTamper: false,
      runWizard: true,
    });
  });

  it('resumes the wizard when setup never finished, even with a settings file', () => {
    expect(decideBoot({ firstRun: false, tampered: false, setupComplete: false })).toEqual({
      warnTamper: false,
      runWizard: true,
    });
  });

  it('warns and proceeds with strict defaults on tamper after setup', () => {
    expect(decideBoot({ firstRun: false, tampered: true, setupComplete: true })).toEqual({
      warnTamper: true,
      runWizard: false,
    });
  });

  it('warns and still gates on the wizard when tampered before setup finished', () => {
    expect(decideBoot({ firstRun: false, tampered: true, setupComplete: false })).toEqual({
      warnTamper: true,
      runWizard: true,
    });
  });

  it('goes straight to routing for a healthy returning user', () => {
    expect(decideBoot({ firstRun: false, tampered: false, setupComplete: true })).toEqual({
      warnTamper: false,
      runWizard: false,
    });
  });
});

describe('cliHelp', () => {
  it('lists every command', () => {
    const text = cliHelp();
    for (const cmd of [
      'termi new',
      'termi go',
      'termi preview',
      'termi learn',
      'termi grownups',
      'termi update',
    ]) {
      expect(text).toContain(cmd);
    }
    expect(text).toContain('build a game');
    expect(text).not.toContain('termi ideas');
  });
});
