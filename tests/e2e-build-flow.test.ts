/**
 * End-to-end paths for the simplified Build a game product.
 * Uses real blankGame, store, preview, prefilter, and agent loop with a
 * mocked language model (no live API key). Temp TERMI_HOME only.
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { runTurn } from '../src/agent/loop.js';
import { createBlankGameProject } from '../src/projects/blankGame.js';
import {
  GAME_IDEAS,
  gameIdeaById,
  isOwnIdea,
} from '../src/projects/gameIdeas.js';
import { listProjects, openProject } from '../src/projects/store.js';
import { startPreview } from '../src/preview/server.js';
import { prefilterInput } from '../src/safety/prefilter.js';
import { createSessionState } from '../src/safety/session.js';
import {
  resolvePromptInput,
  buildGameIdeaCount,
  buildGameIsOwnFirst,
} from '../src/surfaces/buildGame.js';
import {
  helpQuestions,
  parseDoneChoice,
  polishPrompt,
  seedPromptForIdea,
  suggestPromptFromAnswers,
  summarizeProjectFiles,
  completenessHint,
} from '../src/surfaces/buildLoop.js';
import { homeMenuOptions } from '../src/surfaces/home.js';
import { helpText } from '../src/surfaces/commands.js';
import type { PreviewHandle, SafetyPipeline, SnapshotStore } from '../src/types.js';
import { allowedVerdict } from './agent-fakes.js';

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
  totalTokens: 15,
};

type Chunk = Record<string, unknown>;

function textChunks(text: string): Chunk[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: text },
    { type: 'text-end', id: 't1' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: USAGE },
  ];
}

function toolCallChunks(toolName: string, input: object): Chunk[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'tool-call', toolCallId: 'call-1', toolName, input: JSON.stringify(input) },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_use' }, usage: USAGE },
  ];
}

function mockModel(scripts: Chunk[][]): MockLanguageModelV3 {
  let call = 0;
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: scripts[Math.min(call++, scripts.length - 1)] as never[],
      }),
    }),
  });
}

function httpGet(port: number, rawPath: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: rawPath, method: 'GET' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const prev = {
  home: process.env.TERMI_HOME,
  projects: process.env.TERMI_PROJECTS_DIR,
  keyring: process.env.TERMI_KEYRING,
  skip: process.env.TERMI_SKIP_UPDATE,
};

let tempRoot: string;
const handles: PreviewHandle[] = [];

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-e2e-'));
  process.env.TERMI_HOME = path.join(tempRoot, 'home');
  process.env.TERMI_PROJECTS_DIR = path.join(tempRoot, 'projects');
  process.env.TERMI_KEYRING = 'file';
  process.env.TERMI_SKIP_UPDATE = '1';
  fs.mkdirSync(process.env.TERMI_HOME, { recursive: true });
  fs.mkdirSync(process.env.TERMI_PROJECTS_DIR, { recursive: true });
});

afterEach(async () => {
  for (const h of handles.splice(0)) {
    try {
      await h.stop();
    } catch {
      //
    }
  }
  if (prev.home === undefined) delete process.env.TERMI_HOME;
  else process.env.TERMI_HOME = prev.home;
  if (prev.projects === undefined) delete process.env.TERMI_PROJECTS_DIR;
  else process.env.TERMI_PROJECTS_DIR = prev.projects;
  if (prev.keyring === undefined) delete process.env.TERMI_KEYRING;
  else process.env.TERMI_KEYRING = prev.keyring;
  if (prev.skip === undefined) delete process.env.TERMI_SKIP_UPDATE;
  else process.env.TERMI_SKIP_UPDATE = prev.skip;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function allowAllSafety(): SafetyPipeline {
  return {
    prefilterInput: (text) => prefilterInput(text),
    prefilterContext: (text) => text,
    checkInput: async () => allowedVerdict(),
    checkOutputText: async () => allowedVerdict(),
    scanCode: () => ({ ok: true, reasons: [] }),
    extractVisibleText: (_p, content) => content.slice(0, 200),
  };
}

const noopSnapshots: SnapshotStore = {
  beginTurn() {},
  undo: () => false,
  redo: () => false,
};

describe('e2e: product surface contracts', () => {
  it('home menu is Build / Library / Learn only (no multi-scaffold clutter)', () => {
    const values = homeMenuOptions(false, false).map((o) => o.value);
    expect(values).toEqual(['build', 'library', 'learn', 'grownups', 'quit']);
    expect(helpText()).toMatch(/build a new game/i);
    expect(helpText()).not.toMatch(/start a fresh project/i);
  });

  it('idea bank is own-first + 30 HTML games without image gen', () => {
    expect(buildGameIdeaCount()).toBe(31);
    expect(buildGameIsOwnFirst()).toBe(true);
    expect(GAME_IDEAS.filter((g) => !isOwnIdea(g))).toHaveLength(30);
    for (const idea of GAME_IDEAS) {
      if (isOwnIdea(idea)) continue;
      expect(idea.seedPrompt).not.toMatch(/dall-?e|midjourney|image gen/i);
    }
  });
});

describe('e2e: blank game library + live preview', () => {
  it('creates a blank shell, serves it, updates after a write', async () => {
    const project = createBlankGameProject('E2E Maze', 'Maze escape');
    expect(listProjects().map((m) => m.prettyName)).toContain('E2E Maze');
    const reopened = openProject(project.meta.slug);
    expect(reopened).not.toBeNull();
    expect(reopened!.readFile('index.html')).toContain('E2E Maze');
    expect(reopened!.readFile('game.js')).toContain('Ready to build');

    const preview = await startPreview(project.dir, { openBrowser: false });
    handles.push(preview);
    expect(preview.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?$/);

    const first = await httpGet(preview.port, '/');
    expect(first.status).toBe(200);
    expect(first.body).toContain('E2E Maze');
    expect(first.body).toContain('game.js');

    const css = await httpGet(preview.port, '/style.css');
    expect(css.status).toBe(200);
    expect(css.body).toContain('canvas');

    // Simulate a successful build write + notify (what runOneTurn does).
    const builtJs = [
      'const canvas = document.getElementById("game");',
      'const ctx = canvas.getContext("2d");',
      'let score = 0;',
      'ctx.fillText("E2E PLAYABLE", 40, 40);',
    ].join('\n');
    project.writeFile('game.js', builtJs);
    preview.notifyChange();

    const js = await httpGet(preview.port, '/game.js');
    expect(js.status).toBe(200);
    expect(js.body).toContain('E2E PLAYABLE');
    expect(js.body).toContain('score');
  });
});

describe('e2e: prompt loop pure path (help → run → polish)', () => {
  it('builds a runnable prompt from help answers and done/improve gates', () => {
    const maze = gameIdeaById('maze-escape')!;
    expect(seedPromptForIdea(maze).length).toBeGreaterThan(10);
    const draft = suggestPromptFromAnswers(maze, ['glowing walls', 'hard']);
    expect(draft.toLowerCase()).toContain('maze');
    expect(resolvePromptInput('', draft)).toBe(draft);
    expect(resolvePromptInput('  ', draft)).toBe(draft);
    expect(parseDoneChoice('improve')).toBe('improve');
    expect(parseDoneChoice('done')).toBe('done');
    const summary = summarizeProjectFiles([
      { relPath: 'game.js', content: 'const x=1;\n'.repeat(3) },
    ]);
    const polish = polishPrompt(`${completenessHint(summary)}. Project: ${summary}`);
    expect(polish.toLowerCase()).toMatch(/improv|complete|test/);
    expect(helpQuestions(GAME_IDEAS[0]!).length).toBe(3);
  });
});

describe('e2e: agent turn on real blank project + preview notify', () => {
  it('writes game.js through runTurn and reloads the preview file', async () => {
    const project = createBlankGameProject('Agent E2E', 'Catch the stars');
    const preview = await startPreview(project.dir, { openBrowser: false });
    handles.push(preview);
    let notifies = 0;
    const wrappedPreview: PreviewHandle = {
      url: preview.url,
      port: preview.port,
      notifyChange: () => {
        notifies += 1;
        preview.notifyChange();
      },
      stop: () => preview.stop(),
    };

    const newGameJs =
      'const canvas=document.getElementById("game");\nlet score=7;\n// e2e-agent-write\n';
    const model = mockModel([
      toolCallChunks('write_file', { path: 'game.js', content: newGameJs }),
      textChunks('I updated your game. Catch the stars!'),
    ]);

    const result = await runTurn('make a star catch game with a score', {
      provider: {
        id: 'openai-api',
        languageModel: () => model,
        moderationEndpoint: false,
      },
      modelAlias: 'zippy',
      safety: allowAllSafety(),
      session: createSessionState(),
      project,
      snapshots: noopSnapshots,
      preview: wrappedPreview,
      audit: () => undefined,
      ui: { onActivity: () => undefined },
    });

    expect(result.status).toBe('ok');
    expect(result.replyText).toContain('updated your game');
    expect(result.filesChanged).toContain('game.js');
    expect(project.readFile('game.js')).toContain('e2e-agent-write');
    expect(project.readFile('game.js')).toContain('score=7');
    expect(notifies).toBeGreaterThanOrEqual(1);

    const served = await httpGet(preview.port, '/game.js');
    expect(served.body).toContain('e2e-agent-write');
  });

  it('blocks unsafe kid prompts at L0 before the model runs', async () => {
    const project = createBlankGameProject('Safe E2E', 'own');
    const blocked = prefilterInput("don't tell your parents about our chats");
    expect(blocked.ok).toBe(false);
    expect(blocked.block?.categories).toContain('grooming');

    let modelCalls = 0;
    const counting = new MockLanguageModelV3({
      doStream: async () => {
        modelCalls += 1;
        return {
          stream: simulateReadableStream({ chunks: textChunks('nope') as never[] }),
        };
      },
    });

    const result = await runTurn("don't tell your parents about our chats", {
      provider: {
        id: 'openai-api',
        languageModel: () => counting,
        moderationEndpoint: false,
      },
      modelAlias: 'zippy',
      safety: allowAllSafety(), // L0 still runs inside runTurn via safety.prefilterInput
      session: createSessionState(),
      project,
      snapshots: noopSnapshots,
      preview: {
        url: 'http://127.0.0.1:9/',
        port: 9,
        notifyChange: () => undefined,
        stop: async () => undefined,
      },
      audit: () => undefined,
      ui: { onActivity: () => undefined },
    });

    expect(result.status).toBe('blocked');
    expect(modelCalls).toBe(0);
  });
});
