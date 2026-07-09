/**
 * The build session: live preview, safety wiring, the agent turn loop,
 * heartbeat while waiting, typewriter reveal, badges, and chat commands.
 *
 * The agent loop and project snapshot modules load lazily so this file
 * imports cleanly even while other wave modules are still landing.
 */

import * as p from '@clack/prompts';
import { getSecret } from '../auth/keychain.js';
import { hasTokens } from '../auth/tokens.js';
import { startPreview } from '../preview/server.js';
import {
  createProviderClient,
  pickClassifierBackend,
  type ClassifierAvailability,
} from '../providers/index.js';
import { classifyProviderError } from '../providers/errors.js';
import { appendAudit } from '../safety/audit.js';
import { createSafetyPipeline } from '../safety/classifier.js';
import { createSessionState } from '../safety/session.js';
import { renderProviderError } from '../ui/errors.js';
import { heartbeatLine, mascot, type MascotExpression } from '../ui/mascot.js';
import { style } from '../ui/theme.js';
import { T } from '../ui/text.js';
import type {
  AuditEvent,
  PreviewHandle,
  ProviderClient,
  ProviderError,
  Settings,
  SnapshotStore,
} from '../types.js';
import type { ProjectContext } from '../projects/store.js';
import type { TurnResult } from '../agent/loop.js';
import { questsFor, questStepLine, type QuestDef } from '../projects/quests.js';
import { providerLabel } from '../setup/wizard.js';
import {
  executeDone,
  executeIdeas,
  executePreview,
  executeRedo,
  executeUndo,
  helpText,
  parseCommand,
} from './commands.js';
import { awardBadge, loadBadges } from './home.js';
import { renderBadgeShelf } from '../ui/celebrate.js';

export type ChatExit = 'quit' | 'new';

/** Milliseconds between heartbeat updates while the agent works. */
const HEARTBEAT_MS = 3500;
/** Per-character delay for the typewriter reveal. */
const TYPE_DELAY_MS = 12;
/** Ceiling on the whole reveal, so long replies never feel slow. */
const TYPE_TOTAL_BUDGET_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reveals reply text one character at a time. Instant when the
 * TERMI_FAST_TEXT=1 env flag is set (tests and impatient builders).
 */
export async function typewriter(
  text: string,
  write: (chunk: string) => void = (chunk) => void process.stdout.write(chunk),
  delayMs: number = TYPE_DELAY_MS,
): Promise<void> {
  // The reveal never exceeds the total budget: long replies speed up and
  // print instantly once the per-character delay rounds down to zero.
  const perChar = Math.min(delayMs, Math.floor(TYPE_TOTAL_BUDGET_MS / Math.max(1, text.length)));
  if (process.env.TERMI_FAST_TEXT === '1' || perChar <= 0) {
    write(`${text}\n`);
    return;
  }
  for (const ch of text) {
    write(ch);
    await sleep(perChar);
  }
  write('\n');
}

/** True when the reply already offers what to try next. */
export function replyHasTryNext(reply: string): boolean {
  return /try (this|it|that|next)|next,? (try|you)|how about|you could/i.test(reply);
}

function mascotExpressionFrom(name: string): MascotExpression {
  const known: readonly MascotExpression[] = [
    'happy',
    'thinking',
    'building',
    'celebrating',
    'oops',
    'gentleNo',
  ];
  return (known as readonly string[]).includes(name) ? (name as MascotExpression) : 'gentleNo';
}

function providerAvailability(settings: Settings): ClassifierAvailability {
  return {
    'openai-chatgpt': hasTokens(),
    'openai-api': (getSecret('api-key-openai-api') ?? '').length > 0,
    anthropic: (getSecret('api-key-anthropic') ?? '').length > 0,
    // A Grok key only counts once a parent confirmed the adults-only terms.
    xai: (getSecret('api-key-xai') ?? '').length > 0 && settings.xaiParentAck,
  };
}

function say(text: string): void {
  console.log(text);
}

function offlineScreen(): string {
  return [mascot('gentleNo'), '', T.offline.noProvider, T.offline.stillWorks].join('\n');
}

const noopSnapshots: SnapshotStore = {
  beginTurn(): void {
    // No snapshot module yet; undo and redo report nothing to do.
  },
  undo: () => false,
  redo: () => false,
};

type RunTurnFn = typeof import('../agent/loop.js').runTurn;

/** The chat screen for one open project. Resolves when the kid leaves. */
export async function runChat(project: ProjectContext, settings: Settings): Promise<ChatExit> {
  let preview: PreviewHandle | null = null;
  try {
    preview = await startPreview(project.dir, { openBrowser: true });
    p.log.success(`${T.chat.previewOpened} ${style.dim(preview.url)}`);
  } catch {
    p.log.warn('The preview could not start. We can still build.');
  }

  const audit = (event: AuditEvent): void => {
    try {
      appendAudit(event);
    } catch {
      // The chat never falls over because the audit disk write failed.
    }
  };
  const session = createSessionState();

  let provider: ProviderClient | null = null;
  if (settings.activeProvider !== null) {
    try {
      provider = createProviderClient(settings.activeProvider);
    } catch {
      provider = null;
    }
  }
  const backend = pickClassifierBackend(settings, providerAvailability(settings));
  const safety = createSafetyPipeline({
    classifierModel: () =>
      backend.classifierClient !== null
        ? backend.classifierClient.languageModel('classifier', settings.modelAlias)
        : null,
    moderationKey: () => backend.moderationKey,
    audit,
  });

  let snapshots: SnapshotStore = noopSnapshots;
  try {
    const snapMod = await import('../projects/snapshots.js');
    snapshots = snapMod.createSnapshotStore(project);
  } catch {
    snapshots = noopSnapshots;
  }

  let runTurnFn: RunTurnFn | null = null;
  try {
    const loop = await import('../agent/loop.js');
    runTurnFn = loop.runTurn;
  } catch {
    runTurnFn = null;
  }

  let ideaPool: string[] | null = null;
  let ideaNext = 0;
  const nextIdeas = async (count: number): Promise<string[]> => {
    if (ideaPool === null) {
      try {
        const mod = await import('../projects/ideas.js');
        ideaPool = mod.getIdeas(project.meta.scaffoldId);
      } catch {
        ideaPool = [];
      }
    }
    if (ideaPool.length === 0) {
      return [];
    }
    const out: string[] = [];
    for (let i = 0; i < count && i < ideaPool.length; i += 1) {
      const idea = ideaPool[ideaNext % ideaPool.length];
      if (idea !== undefined) {
        out.push(idea);
      }
      ideaNext += 1;
    }
    return out;
  };

  const activeLabel =
    settings.activeProvider !== null ? providerLabel(settings.activeProvider) : 'AI helper';

  let prevTurnErrored = false;
  let turnsTaken = 0;

  const doTurn = async (kidMessage: string): Promise<'ok' | 'blocked' | 'error' | 'offline'> => {
    if (provider === null || runTurnFn === null) {
      say(offlineScreen());
      return 'offline';
    }
    const started = Date.now();
    let heartbeatCleared = false;
    const spin = p.spinner();
    spin.start(T.chat.thinking);
    const beat = setInterval(() => {
      if (!heartbeatCleared) {
        spin.message(heartbeatLine(Math.round((Date.now() - started) / 1000)));
      }
    }, HEARTBEAT_MS);
    const clearHeartbeat = (): void => {
      if (!heartbeatCleared) {
        heartbeatCleared = true;
        clearInterval(beat);
        spin.stop(T.chat.working);
      }
    };
    const ui = {
      onActivity(line: string): void {
        clearHeartbeat();
        say(style.dim(`  ${line}`));
      },
    };

    let result: TurnResult;
    try {
      result = await runTurnFn(kidMessage, {
        provider,
        modelAlias: settings.modelAlias,
        safety,
        session,
        project,
        snapshots,
        preview,
        audit,
        ui,
      });
    } catch (err) {
      clearInterval(beat);
      if (!heartbeatCleared) {
        spin.stop();
      }
      say(renderProviderError(classifyProviderError(err), activeLabel));
      prevTurnErrored = true;
      return 'error';
    }
    clearInterval(beat);
    if (!heartbeatCleared) {
      spin.stop(T.chat.working);
    }
    turnsTaken += 1;

    if (result.status === 'ok') {
      const reply = result.replyText ?? '';
      if (reply.length > 0) {
        await typewriter(reply);
      }
      if (reply.length > 0 && !replyHasTryNext(reply)) {
        const ideas = await nextIdeas(2);
        if (ideas.length > 0) {
          say(style.dim(['Try this next:', ...ideas.map((idea) => `  - ${idea}`)].join('\n')));
        }
      }
      if (result.filesChanged.length > 0) {
        await awardBadge('first-change');
      }
      if (prevTurnErrored) {
        await awardBadge('bug-squasher');
      }
      prevTurnErrored = false;
      return 'ok';
    }

    if (result.status === 'blocked') {
      if (result.screen !== null) {
        say(
          [
            mascot(mascotExpressionFrom(result.screen.mascotExpression)),
            '',
            style.title(result.screen.title),
            result.screen.body,
          ].join('\n'),
        );
      } else {
        say([mascot('gentleNo'), '', T.blocks.generic].join('\n'));
      }
      return 'blocked';
    }

    const error: ProviderError = result.error ?? { kind: 'server' };
    say(renderProviderError(error, activeLabel));
    prevTurnErrored = true;
    return 'error';
  };

  const finish = async (): Promise<void> => {
    try {
      if (turnsTaken > 0) {
        project.updateTermiMd({ recapLine: `We worked on ${project.meta.prettyName}.` });
      }
      project.touch();
    } catch {
      // Notes are best effort on the way out.
    }
    if (preview !== null) {
      try {
        await preview.stop();
      } catch {
        // The process is leaving anyway.
      }
    }
  };

  p.log.message(style.dim(T.chat.doneHint));
  if (questsFor(project.meta.scaffoldId).length > 0) {
    p.log.message(style.dim(T.quest.hint));
  }

  let quest: QuestDef | null = null;
  let questStep = 0;
  const questAdvance = async (): Promise<void> => {
    if (quest === null) {
      return;
    }
    questStep += 1;
    if (questStep >= quest.steps.length) {
      quest = null;
      say(style.title(T.quest.finished));
      await awardBadge('quest-hero');
    } else {
      say(style.dim(T.quest.stepDone));
    }
  };

  let hintIndex = 0;
  for (;;) {
    const hint = T.hints[hintIndex % T.hints.length] ?? '';
    hintIndex += 1;
    const step = quest !== null ? quest.steps[questStep] : undefined;
    if (quest !== null && step !== undefined) {
      say(style.title(questStepLine(quest, questStep)));
      say(style.dim(T.quest.enterToSend.replace('{prompt}', step.prompt)));
    }
    const raw = await p.text({
      message: T.chat.placeholder,
      placeholder: step !== undefined ? step.prompt : hint,
    });
    if (p.isCancel(raw)) {
      await finish();
      return 'quit';
    }
    const cmd = parseCommand(raw);
    switch (cmd.kind) {
      case 'chat': {
        // In a quest, plain Enter sends the suggested step prompt.
        const text = cmd.text.length > 0 ? cmd.text : (step?.prompt ?? '');
        if (text.length > 0) {
          const outcome = await doTurn(text);
          if (outcome === 'ok') {
            await questAdvance();
          }
        }
        break;
      }
      case 'quest': {
        if (quest !== null) {
          quest = null;
          say(T.quest.stopped);
          break;
        }
        const available = questsFor(project.meta.scaffoldId);
        if (available.length === 0) {
          say(T.quest.none);
          break;
        }
        if (available.length === 1) {
          quest = available[0] ?? null;
        } else {
          const picked = await p.select<string>({
            message: T.quest.pick,
            options: available.map((q) => ({ value: q.id, label: `${q.emoji} ${q.title}` })),
          });
          if (p.isCancel(picked)) {
            break;
          }
          quest = available.find((q) => q.id === picked) ?? null;
        }
        if (quest !== null) {
          questStep = 0;
          say(T.quest.start);
        }
        break;
      }
      case 'undo':
        executeUndo(snapshots, preview, say);
        break;
      case 'redo':
        executeRedo(snapshots, preview, say);
        break;
      case 'preview':
        await executePreview(preview, say);
        break;
      case 'ideas':
        await executeIdeas(project.meta.scaffoldId, say);
        break;
      case 'badges':
        say(renderBadgeShelf(loadBadges()));
        break;
      case 'learn':
        try {
          const learn = await import('../learn/runner.js');
          await learn.runLearnMenu();
        } catch {
          say('Learn mode is taking a nap. Try again soon.');
        }
        break;
      case 'help':
        say(helpText());
        break;
      case 'done':
        await executeDone(
          {
            scaffoldId: project.meta.scaffoldId,
            prettyName: project.meta.prettyName,
            updateRecap: (line) => {
              project.updateTermiMd({ recapLine: line });
            },
          },
          (badgeId) => awardBadge(badgeId),
          say,
        );
        break;
      case 'new':
        await finish();
        return 'new';
      case 'quit':
        say(T.errors.goodbye);
        await finish();
        return 'quit';
      case 'grownups':
        try {
          const panel = await import('../grownups/panel.js');
          await panel.runPanel();
        } catch {
          say(T.grownups.needsGrownup);
        }
        break;
      case 'unknown':
        say(
          cmd.suggestion !== null
            ? T.chat.didYouMean.replace('{command}', `/${cmd.suggestion}`)
            : T.chat.unknownCommand,
        );
        break;
    }
  }
}
