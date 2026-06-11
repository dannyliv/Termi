/**
 * One chat turn, end to end. The order is the safety story:
 * snapshot first, prefilter the kid's words, then run the input classifier
 * and the main model CONCURRENTLY. Tool side effects and the reply reveal
 * both wait for the input verdict. The final text passes the output
 * classifier before anyone sees it. Fail closed everywhere.
 *
 * The heartbeat display is the caller's job; this loop only emits
 * kid-readable activity lines through deps.ui.onActivity.
 */

import { stepCountIs, streamText, type LanguageModel, type ModelMessage } from 'ai';
import { classifyProviderError } from '../providers/errors.js';
import { scaffoldById } from '../projects/scaffolds/index.js';
import type { ProjectContext } from '../projects/store.js';
import { verdictToScreen } from '../safety/blocks.js';
import { recordTurn } from '../safety/session.js';
import { failClosedVerdict } from '../safety/taxonomy.js';
import type {
  AuditEvent,
  ClassifierVerdict,
  ModelAlias,
  PreviewHandle,
  ProviderClient,
  ProviderError,
  SafetyPipeline,
  SessionSafetyState,
  SnapshotStore,
} from '../types.js';
import { formatResetTime } from '../ui/errors.js';
import { T } from '../ui/text.js';
import {
  buildMessages,
  createEmbedState,
  providerOptionsFor,
  trimHistory,
  type EmbedState,
  type HistoryEntry,
} from './context.js';
import { buildSystemPrompt } from './prompts/system.js';
import { createAgentTools } from './tools.js';

/** Max model steps (tool rounds plus the final reply) per turn. */
export const MAX_TURN_STEPS = 10;

export interface TurnUi {
  onActivity(line: string): void;
}

export interface TurnDeps {
  provider: ProviderClient;
  modelAlias: ModelAlias;
  safety: SafetyPipeline;
  session: SessionSafetyState;
  project: ProjectContext;
  snapshots: SnapshotStore;
  preview: PreviewHandle | null;
  audit: (e: AuditEvent) => void;
  ui: TurnUi;
}

export interface TurnScreen {
  title: string;
  body: string;
  mascotExpression: string;
}

export interface TurnResult {
  status: 'ok' | 'blocked' | 'provider-error';
  replyText: string | null;
  screen: TurnScreen | null;
  filesChanged: string[];
  error: ProviderError | null;
}

interface SessionTurnState {
  history: HistoryEntry[];
  embed: EmbedState;
}

/**
 * Chat history and the changed-file embed tracker live per ProjectContext
 * instance: one session keeps one ProjectContext, so a new session starts
 * fresh and nothing leaks across projects.
 */
const turnStates = new WeakMap<ProjectContext, SessionTurnState>();

function turnStateFor(project: ProjectContext): SessionTurnState {
  let state = turnStates.get(project);
  if (state === undefined) {
    state = { history: [], embed: createEmbedState() };
    turnStates.set(project, state);
  }
  return state;
}

function blockedResult(verdict: ClassifierVerdict, filesChanged: string[]): TurnResult {
  return {
    status: 'blocked',
    replyText: null,
    screen: verdictToScreen(verdict),
    filesChanged,
    error: null,
  };
}

/** Kid-safe screen for a provider failure. Copy comes from the T registry. */
export function providerErrorScreen(error: ProviderError): TurnScreen {
  switch (error.kind) {
    case 'rate-limit': {
      const message =
        error.retryAfter !== undefined
          ? T.quota.message.replace('{time}', formatResetTime(error.retryAfter))
          : T.quota.messageNoTime;
      const items = T.quota.stillWorks.map((item) => `- ${item}`);
      return {
        title: T.errors.oops,
        body: [message, '', T.quota.stillWorksIntro, ...items].join('\n'),
        mascotExpression: 'oops',
      };
    }
    case 'auth':
      return { title: T.errors.oops, body: T.errors.auth, mascotExpression: 'oops' };
    case 'server':
      return { title: T.errors.oops, body: T.errors.server, mascotExpression: 'oops' };
    case 'network':
      return {
        title: T.errors.oops,
        body: [T.errors.network, T.offline.network].join('\n'),
        mascotExpression: 'oops',
      };
  }
}

export async function runTurn(kidMessage: string, deps: TurnDeps): Promise<TurnResult> {
  // (0) Snapshot before anything can write, so /undo always has this turn.
  deps.snapshots.beginTurn();

  // (1) L0 prefilter: hard block ends the turn; PII redacts with a notice.
  const pre = deps.safety.prefilterInput(kidMessage);
  if (pre.block !== null) {
    return blockedResult(pre.block, []);
  }
  const kidText = pre.redacted;
  const notice = pre.notice;

  // (2) Input classifier and main stream run concurrently. The gate holds
  // every tool side effect; a block also aborts the stream to save tokens.
  const abort = new AbortController();
  const gate: Promise<ClassifierVerdict> = deps.safety
    .checkInput(kidText, deps.session)
    .catch(() => failClosedVerdict());
  void gate.then((verdict) => {
    if (!verdict.allowed) {
      abort.abort();
    }
  });

  const filesChanged: string[] = [];
  const tools = createAgentTools(deps, gate, (relPath) => {
    if (!filesChanged.includes(relPath)) {
      filesChanged.push(relPath);
    }
  });

  const state = turnStateFor(deps.project);
  state.history = trimHistory(state.history);
  const scaffoldLabel = scaffoldById(deps.project.meta.scaffoldId)?.label ?? 'project';
  const system = buildSystemPrompt({ prettyName: deps.project.meta.prettyName, scaffoldLabel });
  const options = providerOptionsFor(deps.provider.id);

  // The system prompt rides in messages[0] so per-message cache control
  // applies. It is our own constant, never untrusted content.
  const systemMessage: ModelMessage =
    Object.keys(options.system).length > 0
      ? { role: 'system', content: system, providerOptions: options.system }
      : { role: 'system', content: system };
  const messages: ModelMessage[] = [
    systemMessage,
    ...buildMessages(deps.project, state.history, kidText, state.embed, deps.safety),
  ];

  // (3) Collect the final text without revealing anything.
  let streamError: unknown = null;
  let replyText: string | null = null;
  try {
    const result = streamText({
      model: deps.provider.languageModel('main', deps.modelAlias) as LanguageModel,
      messages,
      allowSystemInMessages: true,
      tools,
      stopWhen: stepCountIs(MAX_TURN_STEPS),
      ...(Object.keys(options.call).length > 0 ? { providerOptions: options.call } : {}),
      abortSignal: abort.signal,
      onError: ({ error }) => {
        if (streamError === null) {
          streamError = error;
        }
      },
    });
    replyText = await result.text;
  } catch (err) {
    if (streamError === null) {
      streamError = err;
    }
  }

  // The input verdict outranks everything: on a block, discard the turn.
  const inputVerdict = await gate;
  if (!inputVerdict.allowed) {
    return blockedResult(inputVerdict, filesChanged);
  }

  if (replyText === null) {
    const error = classifyProviderError(streamError);
    return {
      status: 'provider-error',
      replyText: null,
      screen: providerErrorScreen(error),
      filesChanged,
      error,
    };
  }

  // (4) Output classifier on the final reply. Writes that already landed
  // were each individually scanned and classified before disk.
  const outputVerdict = await deps.safety.checkOutputText(replyText, deps.session);
  if (!outputVerdict.allowed) {
    return blockedResult(outputVerdict, filesChanged);
  }

  // (5) Record both directions for the cross-turn grooming window.
  recordTurn(deps.session, 'kid', kidText);
  recordTurn(deps.session, 'termi', replyText);
  state.history.push({ role: 'kid', text: kidText }, { role: 'termi', text: replyText });

  // (6) Reveal, with the gentle PII reminder first when something was masked.
  const finalReply = notice !== null ? `${notice}\n\n${replyText}` : replyText;
  return { status: 'ok', replyText: finalReply, screen: null, filesChanged, error: null };
}
