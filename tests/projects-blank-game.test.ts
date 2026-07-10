import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlankGameProject } from '../src/projects/blankGame.js';

const prevHome = process.env.TERMI_HOME;
const prevProjects = process.env.TERMI_PROJECTS_DIR;
const prevKeyring = process.env.TERMI_KEYRING;

let tempRoot: string;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-blank-'));
  process.env.TERMI_HOME = path.join(tempRoot, 'home');
  process.env.TERMI_PROJECTS_DIR = path.join(tempRoot, 'projects');
  process.env.TERMI_KEYRING = 'file';
  fs.mkdirSync(process.env.TERMI_HOME, { recursive: true });
  fs.mkdirSync(process.env.TERMI_PROJECTS_DIR, { recursive: true });
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.TERMI_HOME;
  else process.env.TERMI_HOME = prevHome;
  if (prevProjects === undefined) delete process.env.TERMI_PROJECTS_DIR;
  else process.env.TERMI_PROJECTS_DIR = prevProjects;
  if (prevKeyring === undefined) delete process.env.TERMI_KEYRING;
  else process.env.TERMI_KEYRING = prevKeyring;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('createBlankGameProject', () => {
  it('saves a blank HTML shell in the project library without a stock game', () => {
    const project = createBlankGameProject('Sky Cats', 'Catch the stars');
    expect(project.meta.prettyName).toBe('Sky Cats');
    expect(project.meta.scaffoldId).toBe('games');
    expect(project.meta.themeId).toBe('blank');
    const html = project.readFile('index.html');
    const js = project.readFile('game.js');
    expect(html).toContain('Sky Cats');
    expect(js).toContain('Ready to build');
    expect(js).not.toMatch(/score\s*=\s*0|function update\(/i);
    const dir = process.env.TERMI_PROJECTS_DIR!;
    const folders = fs.readdirSync(dir);
    expect(folders.length).toBe(1);
    expect(fs.existsSync(path.join(dir, folders[0]!, 'index.html'))).toBe(true);
  });
});
