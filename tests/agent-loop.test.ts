import { describe, expect, it } from 'vitest';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { runTurn, providerErrorScreen } from '../src/agent/loop.js';
import type { ClassifierVerdict } from '../src/types.js';
import { T } from '../src/ui/text.js';
import { allowedVerdict, blockedVerdict, makeDeps } from './agent-fakes.js';

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

/** Scripted mock: call N gets script N (last script repeats). */
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

function promptText(model: MockLanguageModelV3, callIndex: number): string {
  return JSON.stringify(model.doStreamCalls[callIndex]?.prompt ?? []);
}

describe('runTurn happy path', () => {
  it('runs a tool-call turn: write lands, preview reloads, reply returns', async () => {
    const model = mockModel([
      toolCallChunks('write_file', { path: 'game.js', content: 'let score = 1;' }),
      textChunks('Done! Your score starts at 1. Try a sound next.'),
    ]);
    const fake = makeDeps({ model });
    const result = await runTurn('start my score at 1', fake.deps);

    expect(result.status).toBe('ok');
    expect(result.replyText).toBe('Done! Your score starts at 1. Try a sound next.');
    expect(result.screen).toBeNull();
    expect(result.error).toBeNull();
    expect(result.filesChanged).toEqual(['game.js']);
    expect(fake.project.files.get('game.js')).toBe('let score = 1;');
    expect(fake.notifyCount()).toBe(1);
    expect(fake.activities).toContain('writing game.js');
    // Snapshot first, then the write, then the reload signal.
    expect(fake.order[0]).toBe('beginTurn');
    expect(fake.order.indexOf('write:game.js')).toBeLessThan(fake.order.indexOf('notify'));
    // Both directions recorded for the grooming window.
    expect(fake.deps.session.recentTurns).toHaveLength(2);
  });

  it('sends a stable system message first, with anthropic cache control', async () => {
    const model = mockModel([textChunks('hi!')]);
    const fake = makeDeps({ model });
    await runTurn('hello', fake.deps);
    const first = model.doStreamCalls[0]?.prompt[0] as {
      role: string;
      providerOptions?: Record<string, unknown>;
    };
    expect(first.role).toBe('system');
    expect(first.providerOptions).toEqual({ anthropic: { cacheControl: { type: 'ephemeral' } } });
  });

  it('passes store:false and encrypted reasoning for the ChatGPT sign-in', async () => {
    const model = mockModel([textChunks('hi!')]);
    const fake = makeDeps({ model, providerId: 'openai-chatgpt' });
    await runTurn('hello', fake.deps);
    expect(model.doStreamCalls[0]?.providerOptions).toEqual({
      openai: { store: false, include: ['reasoning.encrypted_content'] },
    });
  });

  it('keeps history across turns and elides unchanged files', async () => {
    const model = mockModel([textChunks('First answer.'), textChunks('Second answer.')]);
    const fake = makeDeps({ model });
    await runTurn('first question', fake.deps);
    const second = await runTurn('second question', fake.deps);
    expect(second.replyText).toBe('Second answer.');
    const prompt = promptText(model, 1);
    expect(prompt).toContain('First answer.');
    expect(prompt).toContain('first question');
    // No writes happened, so turn two embeds no file in full.
    expect(prompt).not.toContain('<project_file path=');
    expect(prompt).toContain('<project_file_list');
  });
});

describe('runTurn input gate', () => {
  it('hard prefilter block ends the turn before any model call', async () => {
    const model = mockModel([textChunks('never seen')]);
    const fake = makeDeps({ model });
    fake.safety.prefilterBlockVerdict = blockedVerdict('profanity');
    const result = await runTurn('bad words here', fake.deps);
    expect(result.status).toBe('blocked');
    expect(result.replyText).toBeNull();
    expect(result.screen?.title).toBe('Let us try that another way.');
    expect(model.doStreamCalls).toHaveLength(0);
    expect(fake.order[0]).toBe('beginTurn'); // snapshot still happened first
  });

  it('a blocked input verdict holds tool side effects and discards the turn', async () => {
    const model = mockModel([
      toolCallChunks('write_file', { path: 'game.js', content: 'sneaky' }),
      textChunks('should never be seen'),
    ]);
    const fake = makeDeps({ model });
    let release: (v: ClassifierVerdict) => void = () => {};
    fake.safety.inputVerdict = new Promise<ClassifierVerdict>((resolve) => {
      release = resolve;
    });

    const turn = runTurn('make the thing', fake.deps);
    // Let the stream emit its tool call while the verdict is still pending.
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(fake.project.writes).toHaveLength(0); // held by the gate
    release(blockedVerdict('jailbreak'));
    const result = await turn;

    expect(result.status).toBe('blocked');
    expect(result.replyText).toBeNull();
    expect(result.screen?.body).toContain(T.blocks.byCategory.jailbreak);
    expect(result.filesChanged).toEqual([]);
    expect(fake.project.writes).toHaveLength(0); // the model tried, the gate held
    expect(fake.notifyCount()).toBe(0);
    expect(model.doStreamCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('records a blocked kid message into the grooming window', async () => {
    const model = mockModel([textChunks('never shown')]);
    const fake = makeDeps({ model });
    fake.safety.inputVerdict = Promise.resolve(blockedVerdict('grooming'));
    const result = await runTurn('what school do you go to', fake.deps);
    expect(result.status).toBe('blocked');
    expect(fake.deps.session.recentTurns).toHaveLength(1);
    expect(fake.deps.session.recentTurns[0]?.role).toBe('kid');
    expect(fake.deps.session.recentTurns[0]?.text).toContain('what school');
  });

  it('fails closed when the input classifier itself breaks', async () => {
    const model = mockModel([textChunks('hello')]);
    const fake = makeDeps({ model });
    fake.safety.inputVerdict = Promise.reject(new Error('classifier down'));
    fake.safety.inputVerdict.catch(() => {});
    const result = await runTurn('hi', fake.deps);
    expect(result.status).toBe('blocked');
    expect(result.screen?.body).toContain(T.errors.failClosed);
  });
});

describe('runTurn output gate', () => {
  it('blocks the reply when the output classifier says no', async () => {
    const model = mockModel([textChunks('something that fails the check')]);
    const fake = makeDeps({ model });
    fake.safety.outputVerdict = blockedVerdict('violence');
    const result = await runTurn('hi', fake.deps);
    expect(result.status).toBe('blocked');
    expect(result.replyText).toBeNull();
    expect(result.screen?.body).toContain(T.blocks.byCategory.violence);
    // The reply text reached the classifier and nothing else.
    expect(fake.safety.checkOutputCalls).toContain('something that fails the check');
  });
});

describe('runTurn provider errors', () => {
  it('maps a 429 to a kid-safe rate-limit screen with the reset time', async () => {
    const err = Object.assign(new Error('rate limited'), {
      statusCode: 429,
      responseHeaders: { 'retry-after': '120' },
    });
    const model = new MockLanguageModelV3({
      doStream: async () => {
        throw err;
      },
    });
    const fake = makeDeps({ model });
    const result = await runTurn('hi', fake.deps);
    expect(result.status).toBe('provider-error');
    expect(result.error).toEqual({ kind: 'rate-limit', retryAfter: 120 });
    expect(result.replyText).toBeNull();
    expect(result.screen?.body).toContain('energy');
    expect(result.screen?.body).toContain(T.quota.stillWorksIntro);
  });

  it('builds distinct screens per error kind', () => {
    expect(providerErrorScreen({ kind: 'auth' }).body).toBe(T.errors.auth);
    expect(providerErrorScreen({ kind: 'server' }).body).toBe(T.errors.server);
    expect(providerErrorScreen({ kind: 'network' }).body).toContain(T.errors.network);
    expect(providerErrorScreen({ kind: 'rate-limit' }).body).toContain(T.quota.messageNoTime);
  });
});

describe('runTurn redaction', () => {
  it('sends the redacted text to the model and prepends the notice', async () => {
    const model = mockModel([textChunks('Got it!')]);
    const fake = makeDeps({ model });
    fake.safety.redactTo = 'my number is [secret]';
    const result = await runTurn('my number is 415 555 0100', fake.deps);
    expect(result.status).toBe('ok');
    expect(result.replyText).toBe(`${T.chat.piiReminder}\n\nGot it!`);
    const prompt = promptText(model, 0);
    expect(prompt).toContain('[secret]');
    expect(prompt).not.toContain('415 555 0100');
  });
});
