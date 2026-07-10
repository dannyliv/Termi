/**
 * The safety pipeline (L0 + L2 + L4 wiring). FAIL CLOSED is the law here:
 * any timeout, HTTP error, rate limit, or malformed verdict becomes a block
 * with failClosed set. The main model's output is never revealed and writes
 * never land without a clean pass.
 *
 * Backends:
 * - With an OpenAI moderation key: the free moderation endpoint covers the
 *   broad taxonomy while a compact prompted kid-check (grooming, pii,
 *   jailbreak) runs in parallel on the classifier model.
 * - Without one: a single prompted classifier covers the full taxonomy.
 */

import { createHash } from 'node:crypto';
import { streamText, type LanguageModel } from 'ai';
import type {
  AuditEvent,
  ClassifierVerdict,
  PrefilterInputResult,
  SafetyCategory,
  SafetyPipeline,
  SessionSafetyState,
} from '../types.js';
import { T } from '../ui/text.js';
import { scanCode } from './codescan.js';
import {
  normalizeText,
  prefilterContext as prefilterContextImpl,
  prefilterInput as prefilterInputImpl,
} from './prefilter.js';
import type { LocalGuardClient } from './guardrunner.js';
import { bumpCounters, groomingEscalation, windowText } from './session.js';
import {
  blockMessage,
  buildClassifierPrompt,
  failClosedVerdict,
  MODERATION_CUTOFFS,
  parseVerdict,
  primaryCategory,
  severityBlocks,
} from './taxonomy.js';
import { extractVisibleText } from './textextract.js';

export const DEFAULT_TIMEOUT_MS = 8000;
const MODERATION_URL = 'https://api.openai.com/v1/moderations';
const MODERATION_MODEL = 'omni-moderation-latest';
/** Chars of judged text per prompted-check call (token efficiency). */
export const JUDGE_TEXT_CAP = 2000;
/**
 * Verdict budget for one prompted check. Reasoning models spend thinking
 * tokens from this budget before any visible text; too small a cap starves
 * the verdict, which fails closed and blocks everything. Keep it roomy.
 */
export const CLASSIFIER_MAX_OUTPUT_TOKENS = 600;
/** Most allow verdicts remembered per session for unchanged file text. */
const FILE_VERDICT_CACHE_CAP = 200;

export interface SafetyPipelineDeps {
  /** AI SDK LanguageModel for prompted checks, or null when unavailable. */
  classifierModel: () => unknown | null;
  /** OpenAI API key for the free moderation endpoint, or null. */
  moderationKey: () => string | null;
  /** On-device classifier, or null when off or its model is not downloaded. */
  localGuard?: () => LocalGuardClient | null;
  fetchImpl?: typeof fetch;
  audit: (e: AuditEvent) => void;
  /** Per remote call. Default 8000. The guard bounds its own calls. */
  timeoutMs?: number;
}

/** Rejects when the wrapped promise takes longer than ms. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('safety check timed out')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function maxSeverity(a: 0 | 1 | 2 | 3, b: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
  return a >= b ? a : b;
}

/** Merges parallel verdicts: most severe wins, any failure stays a block. */
function mergeVerdicts(verdicts: ClassifierVerdict[]): ClassifierVerdict {
  if (verdicts.length === 0) {
    return failClosedVerdict();
  }
  const categories: SafetyCategory[] = [];
  let severity: 0 | 1 | 2 | 3 = 0;
  let selfHarmConcern = false;
  let anyFailClosed = false;
  let allAllowed = true;
  for (const v of verdicts) {
    for (const c of v.categories) {
      if (!categories.includes(c)) {
        categories.push(c);
      }
    }
    severity = maxSeverity(severity, v.severity);
    selfHarmConcern = selfHarmConcern || v.selfHarmConcern;
    anyFailClosed = anyFailClosed || v.failClosed;
    allAllowed = allAllowed && v.allowed;
  }
  const blocked = anyFailClosed || !allAllowed || severityBlocks(categories, severity);
  if (!blocked) {
    return { allowed: true, categories, severity, selfHarmConcern, failClosed: false, kidMessage: null };
  }
  return {
    allowed: false,
    categories,
    severity,
    selfHarmConcern,
    failClosed: anyFailClosed,
    kidMessage: categories.length > 0 ? blockMessage(categories) : T.errors.failClosed,
  };
}

interface ModerationScores {
  [key: string]: unknown;
}

async function moderationCheck(
  key: string,
  text: string,
  fetchImpl: typeof fetch,
): Promise<ClassifierVerdict> {
  const res = await fetchImpl(MODERATION_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: MODERATION_MODEL, input: text }),
  });
  if (!res.ok) {
    throw new Error(`moderation endpoint returned ${res.status}`);
  }
  const data = (await res.json()) as { results?: { category_scores?: ModerationScores }[] };
  const scores = data.results?.[0]?.category_scores;
  if (!scores || typeof scores !== 'object') {
    throw new Error('moderation response malformed');
  }
  // An empty or unrecognized scores object must not read as "all clear".
  if (!MODERATION_CUTOFFS.some((cutoff) => typeof scores[cutoff.score] === 'number')) {
    throw new Error('moderation response malformed');
  }
  const categories: SafetyCategory[] = [];
  let severity: 0 | 1 | 2 | 3 = 0;
  let selfHarmConcern = false;
  for (const cutoff of MODERATION_CUTOFFS) {
    const value = scores[cutoff.score];
    if (typeof value === 'number' && value >= cutoff.min) {
      if (!categories.includes(cutoff.category)) {
        categories.push(cutoff.category);
      }
      severity = maxSeverity(severity, cutoff.severity);
      if (cutoff.selfHarmConcern) {
        selfHarmConcern = true;
      }
    }
  }
  const blocked = severityBlocks(categories, severity);
  return {
    allowed: !blocked,
    categories,
    severity,
    selfHarmConcern,
    failClosed: false,
    kidMessage: blocked ? blockMessage(categories) : null,
  };
}

async function promptedCheck(
  model: LanguageModel,
  direction: 'input' | 'output',
  composedWindow: string,
  scope: 'full' | 'kidcheck',
): Promise<ClassifierVerdict> {
  // streamText, not generateText: the ChatGPT coding backend requires
  // stream true on every call. The text is collected, never revealed.
  let streamError: unknown = null;
  const result = streamText({
    model,
    prompt: buildClassifierPrompt(direction, composedWindow, scope),
    temperature: 0,
    maxOutputTokens: CLASSIFIER_MAX_OUTPUT_TOKENS,
    onError: ({ error }) => {
      if (streamError === null) {
        streamError = error;
      }
    },
  });
  let text: string;
  try {
    text = await result.text;
  } catch (err) {
    throw streamError ?? err;
  }
  if (streamError !== null) {
    throw streamError;
  }
  return parseVerdict(text);
}

/**
 * Judged text is data. Braces are swapped for parentheses before the text
 * enters a classifier prompt, so an echo of judged content can never form
 * the JSON object that parseVerdict looks for (verdict forgery).
 */
function neutralizeJudged(text: string): string {
  return text.replace(/\{/g, '(').replace(/\}/g, ')');
}

/** Splits normalized judged text into prompt-sized chunks (at least one). */
function judgeChunks(normalized: string): string[] {
  if (normalized.length <= JUDGE_TEXT_CAP) {
    return [normalized];
  }
  const chunks: string[] = [];
  for (let i = 0; i < normalized.length; i += JUDGE_TEXT_CAP) {
    chunks.push(normalized.slice(i, i + JUDGE_TEXT_CAP));
  }
  return chunks;
}

export function createSafetyPipeline(deps: SafetyPipelineDeps): SafetyPipeline {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  // Session-scoped allow cache for file text: the same visible text is never
  // re-judged remotely twice. Blocks and failures are never cached.
  const fileAllowCache = new Set<string>();

  function auditVerdict(
    verdict: ClassifierVerdict,
    direction: 'input' | 'output',
    text: string,
    groomingFlag: boolean,
  ): void {
    if (verdict.allowed) {
      return;
    }
    deps.audit({
      ts: new Date().toISOString(),
      layer: direction === 'input' ? 'L2' : 'L4',
      event: groomingFlag ? 'grooming_flag' : verdict.failClosed ? 'fail_closed' : 'block',
      category: primaryCategory(verdict.categories) ?? undefined,
      severity: verdict.severity,
      direction,
      excerpt: text.slice(0, 80),
    });
  }

  async function check(
    direction: 'input' | 'output',
    text: string,
    state: SessionSafetyState,
    source: 'chat' | 'file',
  ): Promise<ClassifierVerdict> {
    try {
      const normalized = normalizeText(text);
      const cacheKey =
        source === 'file'
          ? createHash('sha256').update(normalized).digest('hex')
          : null;
      if (cacheKey !== null && fileAllowCache.has(cacheKey)) {
        return {
          allowed: true,
          categories: [],
          severity: 0,
          selfHarmConcern: false,
          failClosed: false,
          kidMessage: null,
        };
      }

      // Every chunk of the judged text gets its own prompted check, so
      // nothing past the per-call cap goes unjudged. Braces in judged text
      // are neutralized so an echo cannot forge a verdict.
      const window = neutralizeJudged(windowText(state));
      const chunks = judgeChunks(neutralizeJudged(normalized));

      const tasks: Promise<ClassifierVerdict>[] = [];
      const key = deps.moderationKey();
      const model = deps.classifierModel() as LanguageModel | null;
      const guard = deps.localGuard?.() ?? null;
      if (key) {
        tasks.push(withTimeout(moderationCheck(key, text, fetchImpl), timeoutMs));
      }
      if (guard) {
        // The on-device guard judges every chunk across its full taxonomy,
        // for input and output alike. On output checks it also sees the
        // kid's last message, the exchange shape it was trained on. No
        // withTimeout wrapper here: the runner bounds its own load and each
        // generation, and chunks queue behind one another, so an outer timer
        // started at task creation would fail-closed on long files for
        // nothing more than waiting their turn.
        const lastKid =
          [...state.recentTurns].reverse().find((turn) => turn.role === 'kid')?.text ?? '';
        for (const chunk of chunks) {
          tasks.push(
            direction === 'input'
              ? guard.classifyInput(chunk)
              : guard.classifyOutput(lastKid, chunk),
          );
        }
      }
      if (model) {
        // Only the moderation endpoint narrows the prompted check to the
        // kid-specific categories: its taxonomy covers hate and harassment.
        // The on-device guard does NOT narrow it. The guard has no
        // hate_harassment or profanity category, so with the guard as the
        // only broad backend the full prompted scope must keep running or
        // those two categories would silently lose their model coverage.
        const scope = key ? 'kidcheck' : 'full';
        for (const chunk of chunks) {
          const composedWindow = `${window}\nTEXT TO JUDGE:\n${chunk}`;
          tasks.push(withTimeout(promptedCheck(model, direction, composedWindow, scope), timeoutMs));
        }
      }

      let merged: ClassifierVerdict;
      if (tasks.length === 0) {
        // No classifier backend available: never fail open.
        merged = failClosedVerdict();
      } else {
        const settled = await Promise.all(tasks.map((t) => t.catch(() => failClosedVerdict())));
        merged = mergeVerdicts(settled);
      }

      // Cross-turn grooming escalation off cumulative session counters.
      // File text never bumps: counters track the conversation (what the
      // kid types and what Termi says), not the kid's own game content.
      if (source === 'chat') {
        bumpCounters(state, merged.categories, text);
      }
      let groomingFlag = false;
      if (source === 'chat' && groomingEscalation(state)) {
        groomingFlag = true;
        const categories: SafetyCategory[] = merged.categories.includes('grooming')
          ? merged.categories
          : ['grooming', ...merged.categories];
        merged = {
          allowed: false,
          categories,
          severity: maxSeverity(merged.severity, 2),
          selfHarmConcern: merged.selfHarmConcern,
          failClosed: merged.failClosed,
          kidMessage: blockMessage(categories),
        };
      }

      if (cacheKey !== null && merged.allowed && !merged.failClosed) {
        if (fileAllowCache.size >= FILE_VERDICT_CACHE_CAP) {
          fileAllowCache.clear();
        }
        fileAllowCache.add(cacheKey);
      }

      auditVerdict(merged, direction, text, groomingFlag);
      return merged;
    } catch {
      // Belt and suspenders: nothing in this pipeline may throw upward.
      const verdict = failClosedVerdict();
      auditVerdict(verdict, direction, text, false);
      return verdict;
    }
  }

  return {
    prefilterInput(text: string): PrefilterInputResult {
      const result = prefilterInputImpl(text);
      if (result.block) {
        deps.audit({
          ts: new Date().toISOString(),
          layer: 'L0',
          event: 'block',
          category: result.block.categories[0],
          severity: result.block.severity,
          direction: 'input',
          excerpt: text.slice(0, 80),
        });
      } else if (result.notice) {
        deps.audit({
          ts: new Date().toISOString(),
          layer: 'L0',
          event: 'redact',
          category: 'pii',
          direction: 'input',
          // The excerpt comes from the redacted text so PII never lands in the log.
          excerpt: result.redacted.slice(0, 80),
        });
      }
      return result;
    },
    prefilterContext(text: string): string {
      return prefilterContextImpl(text);
    },
    checkInput(text: string, s: SessionSafetyState): Promise<ClassifierVerdict> {
      return check('input', text, s, 'chat');
    },
    checkOutputText(
      text: string,
      s: SessionSafetyState,
      source: 'reply' | 'file' = 'reply',
    ): Promise<ClassifierVerdict> {
      return check('output', text, s, source === 'file' ? 'file' : 'chat');
    },
    scanCode,
    extractVisibleText,
  };
}
