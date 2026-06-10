import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verdictToScreen } from '../src/safety/blocks.js';
import { createSafetyPipeline, type SafetyPipelineDeps } from '../src/safety/classifier.js';
import { createSessionState, recordTurn } from '../src/safety/session.js';
import { T } from '../src/ui/text.js';
import type { AuditEvent } from '../src/types.js';
import { ALLOWED_VERDICT_JSON, MUST_BLOCK, MUST_NOT_BLOCK, mockVerdictFor } from './safety-corpus.js';

/** A mock classifier model that replies with a fixed verdict JSON. */
function verdictModel(json: string, onPrompt?: (prompt: string) => void): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      onPrompt?.(JSON.stringify(options.prompt));
      return {
        finishReason: { unified: 'stop' as const },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
        content: [{ type: 'text' as const, text: json }],
        warnings: [],
      };
    },
  });
}

/** A model whose call never resolves: forces the timeout path. */
function hangingModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: () => new Promise(() => {}),
  });
}

function makeDeps(overrides: Partial<SafetyPipelineDeps> = {}): {
  deps: SafetyPipelineDeps;
  audits: AuditEvent[];
} {
  const audits: AuditEvent[] = [];
  const deps: SafetyPipelineDeps = {
    classifierModel: () => null,
    moderationKey: () => null,
    audit: (e) => audits.push(e),
    timeoutMs: 1000,
    ...overrides,
  };
  return { deps, audits };
}

function moderationResponse(scores: Record<string, number>): typeof fetch {
  const full = {
    sexual: 0,
    'sexual/minors': 0,
    'self-harm': 0,
    'self-harm/intent': 0,
    'self-harm/instructions': 0,
    violence: 0,
    'violence/graphic': 0,
    harassment: 0,
    'harassment/threatening': 0,
    hate: 0,
    'hate/threatening': 0,
    illicit: 0,
    'illicit/violent': 0,
    ...scores,
  };
  return (async () =>
    new Response(JSON.stringify({ results: [{ category_scores: full }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('MUST-NOT-BLOCK corpus flows through as allowed', () => {
  it.each(MUST_NOT_BLOCK)('allows: %s', async (prompt) => {
    const { deps, audits } = makeDeps({ classifierModel: () => verdictModel(ALLOWED_VERDICT_JSON) });
    const pipeline = createSafetyPipeline(deps);
    const pre = pipeline.prefilterInput(prompt);
    expect(pre.ok).toBe(true);
    expect(pre.notice).toBeNull();
    const verdict = await pipeline.checkInput(pre.redacted, createSessionState());
    expect(verdict.allowed).toBe(true);
    expect(verdict.failClosed).toBe(false);
    expect(audits).toHaveLength(0);
  });
});

describe('MUST-BLOCK corpus', () => {
  const prefilterCases = MUST_BLOCK.filter((c) => c.prefilterBlocks);
  const classifierCases = MUST_BLOCK.filter((c) => !c.prefilterBlocks);

  it.each(prefilterCases)('prefilter blocks: $text', ({ text }) => {
    const { deps, audits } = makeDeps();
    const pipeline = createSafetyPipeline(deps);
    const pre = pipeline.prefilterInput(text);
    expect(pre.ok).toBe(false);
    expect(pre.block).not.toBeNull();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.layer).toBe('L0');
    expect(audits[0]?.event).toBe('block');
  });

  it.each(classifierCases)('classifier blocks with the right screen: $text', async ({ text, kind }) => {
    const { deps, audits } = makeDeps({ classifierModel: () => verdictModel(mockVerdictFor(kind)) });
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkInput(text, createSessionState());
    expect(verdict.allowed).toBe(false);
    expect(verdict.failClosed).toBe(false);
    expect(verdict.categories).toContain(kind);

    const screen = verdictToScreen(verdict);
    if (kind === 'self_harm') {
      expect(verdict.selfHarmConcern).toBe(true);
      expect(screen.body).toBe(T.selfHarmSupport.message);
      expect(screen.body).toContain('988');
    } else {
      expect(screen.body).toContain(T.blocks.byCategory[kind]);
      expect(screen.body).toContain(T.blocks.rephraseTip);
      expect(screen.body).not.toContain(text);
    }
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0]?.event === 'block' || audits[0]?.event === 'grooming_flag').toBe(true);
    expect(audits[0]?.layer).toBe('L2');
    expect((audits[0]?.excerpt ?? '').length).toBeLessThanOrEqual(80);
  });
});

describe('fail closed everywhere', () => {
  it('hanging classifier model times out into a failClosed block', async () => {
    const { deps, audits } = makeDeps({
      classifierModel: () => hangingModel(),
      timeoutMs: 50,
    });
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkInput('make a fun game', createSessionState());
    expect(verdict.allowed).toBe(false);
    expect(verdict.failClosed).toBe(true);
    expect(verdict.kidMessage).toBe(T.errors.failClosed);
    expect(audits[0]?.event).toBe('fail_closed');
    expect(verdictToScreen(verdict).body).toBe(T.errors.failClosed);
  });

  it('moderation 429 fails closed', async () => {
    const fetch429 = (async () => new Response('rate limited', { status: 429 })) as unknown as typeof fetch;
    const { deps, audits } = makeDeps({ moderationKey: () => 'sk-test', fetchImpl: fetch429 });
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkInput('hello', createSessionState());
    expect(verdict.allowed).toBe(false);
    expect(verdict.failClosed).toBe(true);
    expect(audits[0]?.event).toBe('fail_closed');
  });

  it('moderation 500 fails closed', async () => {
    const fetch500 = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const { deps } = makeDeps({ moderationKey: () => 'sk-test', fetchImpl: fetch500 });
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkOutputText('hello', createSessionState());
    expect(verdict.failClosed).toBe(true);
  });

  it('a fetch that rejects fails closed', async () => {
    const fetchBoom = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const { deps } = makeDeps({ moderationKey: () => 'sk-test', fetchImpl: fetchBoom });
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkInput('hello', createSessionState());
    expect(verdict.failClosed).toBe(true);
  });

  it('malformed JSON verdict fails closed', async () => {
    const { deps } = makeDeps({ classifierModel: () => verdictModel('looks fine to me, thumbs up!') });
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkInput('hello', createSessionState());
    expect(verdict.allowed).toBe(false);
    expect(verdict.failClosed).toBe(true);
  });

  it('no classifier backend at all fails closed', async () => {
    const { deps, audits } = makeDeps();
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkInput('hello', createSessionState());
    expect(verdict.failClosed).toBe(true);
    expect(audits[0]?.event).toBe('fail_closed');
  });
});

describe('moderation endpoint mapping', () => {
  it('blocks when a score crosses its cutoff', async () => {
    const { deps } = makeDeps({
      moderationKey: () => 'sk-test',
      fetchImpl: moderationResponse({ sexual: 0.4 }),
    });
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkInput('something', createSessionState());
    expect(verdict.allowed).toBe(false);
    expect(verdict.failClosed).toBe(false);
    expect(verdict.categories).toContain('sexual');
  });

  it('sexual/minors uses the much lower cutoff', async () => {
    const { deps } = makeDeps({
      moderationKey: () => 'sk-test',
      fetchImpl: moderationResponse({ 'sexual/minors': 0.05 }),
    });
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkInput('something', createSessionState());
    expect(verdict.allowed).toBe(false);
    expect(verdict.severity).toBe(3);
  });

  it('self-harm intent sets selfHarmConcern and routes to support copy', async () => {
    const { deps } = makeDeps({
      moderationKey: () => 'sk-test',
      fetchImpl: moderationResponse({ 'self-harm/intent': 0.9, 'self-harm': 0.9 }),
    });
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkInput('something sad', createSessionState());
    expect(verdict.selfHarmConcern).toBe(true);
    expect(verdictToScreen(verdict).body).toBe(T.selfHarmSupport.message);
  });

  it('scores under every cutoff stay allowed', async () => {
    const { deps, audits } = makeDeps({
      moderationKey: () => 'sk-test',
      fetchImpl: moderationResponse({ violence: 0.5 }), // under the 0.65 cutoff
    });
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkInput('make the zombie die', createSessionState());
    expect(verdict.allowed).toBe(true);
    expect(audits).toHaveLength(0);
  });
});

describe('parallel merge: most severe wins', () => {
  it('moderation pass + kid-check grooming hit still blocks', async () => {
    const { deps } = makeDeps({
      moderationKey: () => 'sk-test',
      fetchImpl: moderationResponse({}),
      classifierModel: () => verdictModel('{"a":0,"c":["grooming"],"s":1,"sh":0}'),
    });
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkOutputText('whats your real name, our secret', createSessionState());
    expect(verdict.allowed).toBe(false);
    expect(verdict.categories).toContain('grooming');
  });

  it('moderation block + kid-check pass still blocks', async () => {
    const { deps } = makeDeps({
      moderationKey: () => 'sk-test',
      fetchImpl: moderationResponse({ illicit: 0.9 }),
      classifierModel: () => verdictModel(ALLOWED_VERDICT_JSON),
    });
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkInput('bad ask', createSessionState());
    expect(verdict.allowed).toBe(false);
    expect(verdict.categories).toContain('illicit');
  });

  it('one branch failing closed keeps the block even when the other allows', async () => {
    const { deps } = makeDeps({
      moderationKey: () => 'sk-test',
      fetchImpl: (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch,
      classifierModel: () => verdictModel(ALLOWED_VERDICT_JSON),
    });
    const pipeline = createSafetyPipeline(deps);
    const verdict = await pipeline.checkInput('hello', createSessionState());
    expect(verdict.allowed).toBe(false);
    expect(verdict.failClosed).toBe(true);
  });
});

describe('sliding grooming window and escalation', () => {
  it('recent turns reach the prompted classifier', async () => {
    let seenPrompt = '';
    const { deps } = makeDeps({
      classifierModel: () => verdictModel(ALLOWED_VERDICT_JSON, (p) => (seenPrompt = p)),
    });
    const pipeline = createSafetyPipeline(deps);
    const state = createSessionState();
    recordTurn(state, 'kid', 'can we add a secret level');
    recordTurn(state, 'termi', 'sure, a secret level sounds fun');
    await pipeline.checkInput('make it spooky', state);
    expect(seenPrompt).toContain('can we add a secret level');
    expect(seenPrompt).toContain('TEXT TO JUDGE');
    expect(seenPrompt).toContain('make it spooky');
  });

  it('cumulative counters force a grooming block with a grooming_flag audit', async () => {
    const { deps, audits } = makeDeps({ classifierModel: () => verdictModel(ALLOWED_VERDICT_JSON) });
    const pipeline = createSafetyPipeline(deps);
    const state = createSessionState();

    const v1 = await pipeline.checkOutputText('by the way, what is your real name?', state);
    expect(v1.allowed).toBe(true);
    const v2 = await pipeline.checkOutputText('you can add me on snapchat to keep chatting', state);
    expect(v2.allowed).toBe(true);
    const v3 = await pipeline.checkOutputText("don't tell your parents about this", state);

    expect(v3.allowed).toBe(false);
    expect(v3.categories).toContain('grooming');
    expect(audits.some((a) => a.event === 'grooming_flag')).toBe(true);
  });

  it('a single grooming signal does not escalate', async () => {
    const { deps, audits } = makeDeps({ classifierModel: () => verdictModel(ALLOWED_VERDICT_JSON) });
    const pipeline = createSafetyPipeline(deps);
    const state = createSessionState();
    const v = await pipeline.checkInput('what is your real name?', state);
    expect(v.allowed).toBe(true);
    expect(audits.some((a) => a.event === 'grooming_flag')).toBe(false);
  });
});

describe('PII redaction through the pipeline', () => {
  it('redacts, notices, audits, and does not block', () => {
    const { deps, audits } = makeDeps();
    const pipeline = createSafetyPipeline(deps);
    const result = pipeline.prefilterInput('my phone number is 415 555 1234');
    expect(result.ok).toBe(true);
    expect(result.block).toBeNull();
    expect(result.redacted).toContain('[secret]');
    expect(result.notice).toBe(T.chat.piiReminder);
    expect(audits[0]?.event).toBe('redact');
    expect(audits[0]?.excerpt).not.toContain('415 555 1234');
  });
});

describe('block screens', () => {
  it('failClosed screen uses the quick-break copy and the oops face', () => {
    const screen = verdictToScreen({
      allowed: false,
      categories: [],
      severity: 0,
      selfHarmConcern: false,
      failClosed: true,
      kidMessage: T.errors.failClosed,
    });
    expect(screen.body).toBe(T.errors.failClosed);
    expect(screen.mascotExpression).toBe('oops');
  });

  it('category screens use the gentle-no face and offer a rephrase', () => {
    const screen = verdictToScreen({
      allowed: false,
      categories: ['violence'],
      severity: 2,
      selfHarmConcern: false,
      failClosed: false,
      kidMessage: null,
    });
    expect(screen.mascotExpression).toBe('gentleNo');
    expect(screen.body).toContain(T.blocks.byCategory.violence);
    expect(screen.body).toContain(T.blocks.rephraseTip);
  });

  it('self-harm screen wins over everything else', () => {
    const screen = verdictToScreen({
      allowed: false,
      categories: ['self_harm', 'violence'],
      severity: 3,
      selfHarmConcern: true,
      failClosed: true,
      kidMessage: null,
    });
    expect(screen.body).toBe(T.selfHarmSupport.message);
  });
});
