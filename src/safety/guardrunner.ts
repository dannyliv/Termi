/**
 * llama.cpp runtime for the on-device safety classifier.
 *
 * Loads the pinned GGUF once (lazily, kicked off at client creation so the
 * model warms while the kid reads the greeting) and serializes generation
 * calls through one context sequence. Wrapper segments are tokenized with
 * special tokens enabled; judged segments are tokenized as plain text, so
 * nothing a kid types or a model writes can inject chat-control tokens.
 *
 * Every failure path throws; the safety pipeline turns any throw into a
 * fail-closed block. This module never fails open.
 */

import type { ClassifierVerdict } from '../types.js';
import {
  buildInputSegments,
  buildOutputSegments,
  guardVerdict,
  parseGuardReading,
  type GuardSegment,
} from './localguard.js';
import { guardModelPath, guardModelReady } from './modelstore.js';

/** The verdict is three short lines; anything longer is already garbage. */
export const GUARD_MAX_TOKENS = 96;
/** Per-call generation budget. Model load and queue wait are not counted. */
export const GUARD_TIMEOUT_MS = 20_000;
/** One-time model load budget. A hung native load must not hang the chat. */
export const GUARD_LOAD_TIMEOUT_MS = 60_000;
/** Plenty for the wrapper plus both judged segments at their caps. */
const GUARD_CONTEXT_SIZE = 8192;

export interface LocalGuardClient {
  /** Judges something the kid typed. Throws on any runtime problem. */
  classifyInput(text: string): Promise<ClassifierVerdict>;
  /** Judges text the app produced (reply or file text). Throws on problems. */
  classifyOutput(kidText: string, producedText: string): Promise<ClassifierVerdict>;
}

interface GuardRuntime {
  generate(segments: GuardSegment[], signal: AbortSignal): Promise<string>;
}

async function loadRuntime(): Promise<GuardRuntime> {
  const nlc = await import('node-llama-cpp');
  const llama = await nlc.getLlama({ logLevel: nlc.LlamaLogLevel.error });
  const model = await llama.loadModel({ modelPath: guardModelPath() });
  const context = await model.createContext({ contextSize: GUARD_CONTEXT_SIZE });
  const completion = new nlc.LlamaCompletion({ contextSequence: context.getSequence() });
  return {
    async generate(segments: GuardSegment[], signal: AbortSignal): Promise<string> {
      const prompt = nlc.LlamaText(
        segments.map((s) =>
          s.kind === 'fixed' ? new nlc.SpecialTokensText(s.text) : s.text,
        ),
      );
      return completion.generateCompletion(prompt, {
        maxTokens: GUARD_MAX_TOKENS,
        customStopTriggers: ['<|im_end|>'],
        signal,
      });
    },
  };
}

export interface GuardClientOptions {
  /** Override the per-call generation budget (tests). */
  timeoutMs?: number;
  /** Override the one-time model load budget (tests). */
  loadTimeoutMs?: number;
  /** Override the runtime loader (tests). */
  loadRuntimeImpl?: () => Promise<GuardRuntime>;
}

/** Rejects when the promise takes longer than ms. The load stays bounded. */
function withDeadline<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(reason)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Builds the guard client, or null when the model file is not in place.
 * Creation starts the model load; classify calls wait for it (bounded by
 * the load deadline), then get their own generation timeout. Queue wait is
 * deliberately unbudgeted: every queued call is itself bounded, so a long
 * file's later chunks wait their turn instead of spuriously failing closed.
 */
export function createGuardClient(opts: GuardClientOptions = {}): LocalGuardClient | null {
  if (!guardModelReady()) {
    return null;
  }
  const timeoutMs = opts.timeoutMs ?? GUARD_TIMEOUT_MS;
  const loadTimeoutMs = opts.loadTimeoutMs ?? GUARD_LOAD_TIMEOUT_MS;
  const runtime = (opts.loadRuntimeImpl ?? loadRuntime)();
  // A load failure must surface on classify calls, not as a process crash.
  void runtime.catch(() => undefined);

  let queue: Promise<unknown> = Promise.resolve();

  async function run(segments: GuardSegment[]): Promise<ClassifierVerdict> {
    const rt = await withDeadline(runtime, loadTimeoutMs, 'guard-load-timeout');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('guard-timeout')), timeoutMs);
    try {
      const raw = await rt.generate(segments, controller.signal);
      return guardVerdict(parseGuardReading(raw));
    } finally {
      clearTimeout(timer);
    }
  }

  function enqueue(segments: GuardSegment[]): Promise<ClassifierVerdict> {
    const next = queue.then(() => run(segments));
    queue = next.catch(() => undefined);
    return next;
  }

  return {
    classifyInput: (text: string): Promise<ClassifierVerdict> =>
      enqueue(buildInputSegments(text)),
    classifyOutput: (kidText: string, producedText: string): Promise<ClassifierVerdict> =>
      enqueue(buildOutputSegments(kidText, producedText)),
  };
}

/**
 * Accessor that hot-attaches the guard. It returns null while the model
 * file is still downloading, then builds the client once on the first check
 * after the file lands and reuses it for the rest of the session. The stat
 * call per check is trivial next to a model call.
 */
export function lazyGuardAccessor(
  enabled: boolean,
  opts: GuardClientOptions = {},
): () => LocalGuardClient | null {
  let client: LocalGuardClient | null = null;
  return (): LocalGuardClient | null => {
    if (!enabled) {
      return null;
    }
    if (client === null) {
      try {
        client = createGuardClient(opts);
      } catch {
        client = null;
      }
    }
    return client;
  };
}
