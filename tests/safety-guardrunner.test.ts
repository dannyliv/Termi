import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGuardClient } from '../src/safety/guardrunner.js';
import type { GuardSegment } from '../src/safety/localguard.js';
import { GUARD_MODEL, guardModelPath } from '../src/safety/modelstore.js';
import { T } from '../src/ui/text.js';

let tmpRoot: string;
let savedHome: string | undefined;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-guardrunner-'));
  savedHome = process.env.TERMI_HOME;
  process.env.TERMI_HOME = path.join(tmpRoot, 'home');
});

afterEach(() => {
  if (savedHome === undefined) {
    delete process.env.TERMI_HOME;
  } else {
    process.env.TERMI_HOME = savedHome;
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** Puts a sparse stand-in model file in place so readiness passes. */
function placeModelFile(): void {
  const p = guardModelPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const fd = fs.openSync(p, 'w');
  fs.ftruncateSync(fd, GUARD_MODEL.bytes);
  fs.closeSync(fd);
}

function fakeRuntime(reply: string, log?: string[], delayMs = 0) {
  return async () => ({
    async generate(segments: GuardSegment[], _signal: AbortSignal): Promise<string> {
      log?.push(segments.filter((s) => s.kind === 'judged').map((s) => s.text).join('|'));
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      return reply;
    },
  });
}

describe('createGuardClient', () => {
  it('returns null when the model file is not in place', () => {
    expect(createGuardClient()).toBeNull();
  });

  it('maps a generated verdict for input checks', async () => {
    placeModelFile();
    const client = createGuardClient({
      loadRuntimeImpl: fakeRuntime('Safety: Unsafe\nCategories: Violent'),
    });
    const verdict = await client!.classifyInput('something rough');
    expect(verdict.allowed).toBe(false);
    expect(verdict.categories).toEqual(['violence']);
    expect(verdict.kidMessage).toBe(T.blocks.byCategory.violence);
  });

  it('hands both exchange sides to output checks', async () => {
    placeModelFile();
    const judged: string[] = [];
    const client = createGuardClient({
      loadRuntimeImpl: fakeRuntime('Safety: Safe\nCategories: None\nRefusal: No', judged),
    });
    const verdict = await client!.classifyOutput('add a boss', 'Here is your boss!');
    expect(verdict.allowed).toBe(true);
    expect(judged).toEqual(['add a boss|Here is your boss!']);
  });

  it('serializes concurrent calls through one runtime', async () => {
    placeModelFile();
    const judged: string[] = [];
    const client = createGuardClient({
      loadRuntimeImpl: fakeRuntime('Safety: Safe\nCategories: None', judged, 20),
    });
    await Promise.all([
      client!.classifyInput('first'),
      client!.classifyInput('second'),
      client!.classifyInput('third'),
    ]);
    expect(judged).toEqual(['first', 'second', 'third']);
  });

  it('rejects when generation exceeds its budget', async () => {
    placeModelFile();
    const client = createGuardClient({
      timeoutMs: 30,
      loadRuntimeImpl: async () => ({
        generate: (_segments: GuardSegment[], signal: AbortSignal): Promise<string> =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('guard-timeout')), {
              once: true,
            });
          }),
      }),
    });
    await expect(client!.classifyInput('slow')).rejects.toThrow('guard-timeout');
  });

  it('rejects when the model load hangs', async () => {
    placeModelFile();
    const client = createGuardClient({
      loadTimeoutMs: 30,
      loadRuntimeImpl: () => new Promise(() => {}),
    });
    await expect(client!.classifyInput('x')).rejects.toThrow('guard-load-timeout');
  });

  it('rejects on unparseable output instead of failing open', async () => {
    placeModelFile();
    const client = createGuardClient({
      loadRuntimeImpl: fakeRuntime('sure, that looks fine to me!'),
    });
    await expect(client!.classifyInput('x')).rejects.toThrow('guard-verdict-missing');
  });

  it('lazyGuardAccessor hot-attaches once the model file lands', async () => {
    const { lazyGuardAccessor } = await import('../src/safety/guardrunner.js');
    const accessor = lazyGuardAccessor(true, {
      loadRuntimeImpl: fakeRuntime('Safety: Safe\nCategories: None'),
    });
    expect(accessor()).toBeNull();
    placeModelFile();
    const client = accessor();
    expect(client).not.toBeNull();
    expect(accessor()).toBe(client);
    const verdict = await client!.classifyInput('hi');
    expect(verdict.allowed).toBe(true);
  });

  it('lazyGuardAccessor stays null when the setting is off', async () => {
    const { lazyGuardAccessor } = await import('../src/safety/guardrunner.js');
    placeModelFile();
    expect(lazyGuardAccessor(false)()).toBeNull();
  });

  it('a broken queue entry does not poison later calls', async () => {
    placeModelFile();
    let calls = 0;
    const client = createGuardClient({
      loadRuntimeImpl: async () => ({
        async generate(): Promise<string> {
          calls += 1;
          if (calls === 1) {
            throw new Error('first-call-breaks');
          }
          return 'Safety: Safe\nCategories: None';
        },
      }),
    });
    await expect(client!.classifyInput('one')).rejects.toThrow('first-call-breaks');
    const verdict = await client!.classifyInput('two');
    expect(verdict.allowed).toBe(true);
  });
});
