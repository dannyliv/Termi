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
/** Cap on judged text included in a prompted check (token efficiency). */
const JUDGE_TEXT_CAP = 2000;

export interface SafetyPipelineDeps {
  /** AI SDK LanguageModel for prompted checks, or null when unavailable. */
  classifierModel: () => unknown | null;
  /** OpenAI API key for the free moderation endpoint, or null. */
  moderationKey: () => string | null;
  fetchImpl?: typeof fetch;
  audit: (e: AuditEvent) => void;
  /** Per remote call. Default 8000. */
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
    maxOutputTokens: 150,
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

export function createSafetyPipeline(deps: SafetyPipelineDeps): SafetyPipeline {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

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
  ): Promise<ClassifierVerdict> {
    try {
      const normalized = normalizeText(text).slice(0, JUDGE_TEXT_CAP);
      const composedWindow = `${windowText(state)}\nTEXT TO JUDGE:\n${normalized}`;

      const tasks: Promise<ClassifierVerdict>[] = [];
      const key = deps.moderationKey();
      const model = deps.classifierModel() as LanguageModel | null;
      if (key) {
        tasks.push(withTimeout(moderationCheck(key, text, fetchImpl), timeoutMs));
        if (model) {
          tasks.push(withTimeout(promptedCheck(model, direction, composedWindow, 'kidcheck'), timeoutMs));
        }
      } else if (model) {
        tasks.push(withTimeout(promptedCheck(model, direction, composedWindow, 'full'), timeoutMs));
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
      bumpCounters(state, merged.categories, text);
      let groomingFlag = false;
      if (groomingEscalation(state)) {
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
      return check('input', text, s);
    },
    checkOutputText(text: string, s: SessionSafetyState): Promise<ClassifierVerdict> {
      return check('output', text, s);
    },
    scanCode,
    extractVisibleText,
  };
}
