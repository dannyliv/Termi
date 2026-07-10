/**
 * Build a game: pick an idea, prompt loop, live preview, done/improve,
 * final polish. Projects save in the local library under TERMI_PROJECTS_DIR.
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
import { ensureGuardFetch } from '../safety/guarddownload.js';
import { lazyGuardAccessor } from '../safety/guardrunner.js';
import { guardModelReady } from '../safety/modelstore.js';
import { createSessionState } from '../safety/session.js';
import { nameIsOkay } from '../safety/prefilter.js';
import { createBlankGameProject } from '../projects/blankGame.js';
import {
  GAME_IDEAS,
  gameIdeaById,
  gameIdeaMenuOptions,
  isOwnIdea,
  type GameIdea,
} from '../projects/gameIdeas.js';
import type { ProjectContext } from '../projects/store.js';
import type { TurnResult } from '../agent/loop.js';
import { providerLabel } from '../setup/wizard.js';
import { renderProviderError } from '../ui/errors.js';
import { style } from '../ui/theme.js';
import { T } from '../ui/text.js';
import type {
  AuditEvent,
  PreviewHandle,
  ProviderClient,
  Settings,
  SnapshotStore,
} from '../types.js';
import {
  completenessHint,
  defaultNameForIdea,
  helpQuestions,
  parseDoneChoice,
  polishPrompt,
  seedPromptForIdea,
  suggestPromptFromAnswers,
  summarizeProjectFiles,
} from './buildLoop.js';
import { awardBadge } from './home.js';

function audit(event: AuditEvent): void {
  try {
    appendAudit(event);
  } catch {
    // Never break the kid flow for the log.
  }
}

function providerAvailability(settings: Settings): ClassifierAvailability {
  return {
    'openai-chatgpt': hasTokens(),
    'openai-api': (getSecret('api-key-openai-api') ?? '').length > 0,
    anthropic: (getSecret('api-key-anthropic') ?? '').length > 0,
    xai: (getSecret('api-key-xai') ?? '').length > 0 && settings.xaiParentAck,
  };
}

async function pickIdea(): Promise<GameIdea | null> {
  const pick = await p.select<string>({
    message: 'Build a game. What do you want to make?',
    options: gameIdeaMenuOptions(),
    initialValue: GAME_IDEAS[0]!.id,
  });
  if (p.isCancel(pick)) {
    return null;
  }
  return gameIdeaById(pick) ?? null;
}

async function pickProjectName(idea: GameIdea): Promise<string | null> {
  const suggested = defaultNameForIdea(idea);
  const typed = await p.text({
    message: 'Name your game.',
    initialValue: suggested,
    defaultValue: suggested,
    validate: (value) => {
      const trimmed = (value ?? '').trim() || suggested;
      if (trimmed.length === 0) return 'It needs a name.';
      if (!nameIsOkay(trimmed)) return 'That name will not work. Try another one.';
      return undefined;
    },
  });
  if (p.isCancel(typed)) {
    return null;
  }
  const name = typed.trim() || suggested;
  return name;
}

async function gatherHelpAnswers(idea: GameIdea): Promise<string[] | null> {
  const questions = helpQuestions(idea);
  const answers: string[] = [];
  for (const question of questions) {
    const ans = await p.text({
      message: question,
      validate: (value) =>
        (value ?? '').trim().length > 0 ? undefined : 'Say a little so I can help.',
    });
    if (p.isCancel(ans)) {
      return null;
    }
    answers.push(ans.trim());
  }
  return answers;
}

/**
 * Merge typed input with an optional draft. Empty typing keeps the draft so
 * kids can run a suggested prompt without retyping it.
 */
export function resolvePromptInput(typed: string, draft: string): string | null {
  const resolved = typed.trim() || draft.trim();
  return resolved.length > 0 ? resolved : null;
}

async function obtainPrompt(idea: GameIdea): Promise<string | null> {
  const path = await p.select<'write' | 'help' | 'seed'>({
    message: 'How do you want to tell Termi what to build?',
    options: [
      { value: 'write', label: 'I will write my own prompt' },
      { value: 'help', label: 'Help me with a prompt for my idea' },
      ...(seedPromptForIdea(idea).length > 0
        ? [{ value: 'seed' as const, label: 'Use the ready idea prompt' }]
        : []),
    ],
  });
  if (p.isCancel(path)) {
    return null;
  }

  let draft = '';
  if (path === 'seed') {
    draft = seedPromptForIdea(idea);
  } else if (path === 'help') {
    const answers = await gatherHelpAnswers(idea);
    if (answers === null) {
      return null;
    }
    draft = suggestPromptFromAnswers(idea, answers);
  }

  // When we already have a draft, do not force a long single-line text field.
  // clack text() is unreliable for long initialValue (looks like a placeholder
  // and Enter can fail validate). Offer a clear Run vs Edit choice first.
  if (draft.length > 0) {
    p.note(draft, 'Suggested prompt');
    const action = await p.select<'run' | 'edit'>({
      message: 'Use this prompt?',
      options: [
        { value: 'run', label: 'Run it' },
        { value: 'edit', label: 'Edit it first' },
      ],
      initialValue: 'run',
    });
    if (p.isCancel(action)) {
      return null;
    }
    if (action === 'run') {
      return draft;
    }
  }

  const text = await p.text({
    message: draft.length > 0 ? 'Edit your prompt.' : 'Type your prompt.',
    initialValue: draft.length > 0 ? draft : undefined,
    defaultValue: draft.length > 0 ? draft : undefined,
    placeholder: draft.length > 0 ? undefined : 'Make a fun browser game where...',
    validate: (value) => {
      const resolved = resolvePromptInput(value ?? '', draft);
      return resolved !== null ? undefined : 'Need a prompt to build.';
    },
  });
  if (p.isCancel(text)) {
    return null;
  }
  return resolvePromptInput(text, draft);
}

function listKidFileSummaries(project: ProjectContext): { relPath: string; content: string }[] {
  const out: { relPath: string; content: string }[] = [];
  for (const file of project.listKidFiles()) {
    const content = project.readFile(file.relPath);
    if (content !== null) {
      out.push({ relPath: file.relPath, content });
    }
  }
  return out;
}

async function runOneTurn(
  kidMessage: string,
  deps: {
    provider: ProviderClient;
    settings: Settings;
    project: ProjectContext;
    preview: PreviewHandle;
    safety: ReturnType<typeof createSafetyPipeline>;
    session: ReturnType<typeof createSessionState>;
    snapshots: SnapshotStore;
  },
): Promise<'ok' | 'blocked' | 'error'> {
  const loop = await import('../agent/loop.js');
  const spin = p.spinner();
  spin.start(T.chat.thinking);
  let result: TurnResult;
  try {
    result = await loop.runTurn(kidMessage, {
      provider: deps.provider,
      modelAlias: deps.settings.modelAlias,
      safety: deps.safety,
      session: deps.session,
      project: deps.project,
      snapshots: deps.snapshots,
      preview: deps.preview,
      audit,
      ui: {
        onActivity(line: string): void {
          spin.message(line);
        },
      },
    });
  } catch (err) {
    spin.stop();
    const label =
      deps.settings.activeProvider !== null
        ? providerLabel(deps.settings.activeProvider)
        : 'AI helper';
    console.log(renderProviderError(classifyProviderError(err), label));
    return 'error';
  }
  spin.stop(T.chat.working);
  if (result.status === 'ok') {
    if (result.replyText) {
      console.log(result.replyText);
    }
    try {
      deps.preview.notifyChange();
    } catch {
      // Preview may already be closed.
    }
    return 'ok';
  }
  if (result.status === 'blocked') {
    if (result.screen !== null) {
      console.log(result.screen.body);
    } else {
      console.log(T.blocks.generic);
    }
    return 'blocked';
  }
  if (result.screen !== null) {
    console.log(result.screen.body);
  } else {
    console.log(T.errors.oops);
  }
  return 'error';
}

/**
 * Full Build a game session for one project from idea pick to library save.
 * Returns the project when something was saved, null on cancel at the start.
 */
export async function runBuildGame(settings: Settings): Promise<ProjectContext | null> {
  const idea = await pickIdea();
  if (idea === null) {
    return null;
  }

  const prettyName = await pickProjectName(idea);
  if (prettyName === null) {
    return null;
  }

  let project: ProjectContext;
  try {
    project = createBlankGameProject(prettyName, idea.label);
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : 'Could not create the game folder.');
    return null;
  }
  await awardBadge('first-project');

  let provider: ProviderClient | null = null;
  if (settings.activeProvider !== null) {
    try {
      provider = createProviderClient(settings.activeProvider);
    } catch {
      provider = null;
    }
  }
  if (provider === null) {
    p.log.warn(`${T.offline.noProvider} ${T.offline.stillWorks}`);
    p.log.info(`Your game folder is ready: ${project.meta.prettyName}`);
    return project;
  }

  if (settings.localClassifier && !guardModelReady()) {
    void ensureGuardFetch();
  }

  const backend = pickClassifierBackend(settings, providerAvailability(settings));
  const safety = createSafetyPipeline({
    classifierModel: () =>
      backend.classifierClient !== null
        ? backend.classifierClient.languageModel('classifier', settings.modelAlias)
        : null,
    moderationKey: () => backend.moderationKey,
    localGuard: lazyGuardAccessor(settings.localClassifier),
    audit,
  });
  const session = createSessionState();

  let snapshots: SnapshotStore = {
    beginTurn() {},
    undo() {
      return false;
    },
    redo() {
      return false;
    },
  };
  try {
    const snapMod = await import('../projects/snapshots.js');
    snapshots = snapMod.createSnapshotStore(project);
  } catch {
    // undo optional
  }

  const preview = await startPreview(project.dir, { openBrowser: true });
  console.log(`${T.chat.previewOpened} ${style.dim(preview.url)}`);
  console.log(style.dim('The browser will update after each build.'));

  const turnDeps = { provider, settings, project, preview, safety, session, snapshots };

  // First build
  for (;;) {
    const prompt = await obtainPrompt(idea);
    if (prompt === null) {
      break;
    }
    const status = await runOneTurn(prompt, turnDeps);
    if (status === 'ok') {
      try {
        preview.notifyChange();
      } catch {
        //
      }
    }

    const next = await p.select<string>({
      message: 'Do you think you are done, or want to improve the idea?',
      options: [
        { value: 'improve', label: 'Improve' },
        { value: 'done', label: 'I am done' },
      ],
      initialValue: 'improve',
    });
    if (p.isCancel(next)) {
      break;
    }
    const choice = parseDoneChoice(next);
    if (choice === 'improve') {
      continue;
    }
    if (choice === 'done') {
      console.log(style.title('Testing your game and making final fixes...'));
      const summary = summarizeProjectFiles(listKidFileSummaries(project));
      const hint = completenessHint(summary);
      console.log(style.dim(`Suggestion: ${hint}`));
      const approve = await p.confirm({
        message: 'Apply this final improvement?',
        initialValue: true,
      });
      if (!p.isCancel(approve) && approve) {
        const finalPrompt = polishPrompt(`${hint}. Project: ${summary}`);
        await runOneTurn(finalPrompt, turnDeps);
        try {
          preview.notifyChange();
        } catch {
          //
        }
        console.log(style.good('Final fixes applied. Check the browser!'));
      } else {
        console.log('Okay. Your game is saved as is.');
      }
      break;
    }
  }

  p.log.success(`Saved in your game library: ${project.meta.prettyName}`);
  // Keep preview open so the kid can keep playing; they Ctrl+C later or return home.
  return project;
}

/** Exported for tests that assert the catalog is wired. */
export function buildGameIdeaCount(): number {
  return GAME_IDEAS.length;
}

export function buildGameFirstLabel(): string {
  return GAME_IDEAS[0]?.label ?? '';
}

export function buildGameIsOwnFirst(): boolean {
  const first = GAME_IDEAS[0];
  return first !== undefined && isOwnIdea(first);
}
