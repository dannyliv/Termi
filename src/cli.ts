/**
 * The termi entry point: argv router and boot sequence.
 *
 * Boot: ensureDirs, loadSettings, tamper warning when the settings file
 * fails its integrity check, the setup wizard when setup never finished,
 * global crash handlers, then the route. Exit code 0 for normal paths,
 * 1 for crashes (set by the global handlers).
 */

import fs from 'node:fs';
import * as p from '@clack/prompts';
import { isSetupComplete } from './config/pin.js';
import { ensureDirs, errorLogPath } from './config/paths.js';
import { loadSettings, saveSettings } from './config/settings.js';
import { startPreview } from './preview/server.js';
import { appendAudit } from './safety/audit.js';
import { guardModelReady } from './safety/modelstore.js';
import { renderBanner } from './ui/banner.js';
import { installGlobalHandlers, renderCrash } from './ui/errors.js';
import { mascot } from './ui/mascot.js';
import { style } from './ui/theme.js';
import { T } from './ui/text.js';
import type { Settings } from './types.js';
import { executeIdeas } from './surfaces/commands.js';
import type { ProjectContext } from './projects/store.js';

export interface BootState {
  firstRun: boolean;
  tampered: boolean;
  setupComplete: boolean;
}

export interface BootDecision {
  /** Show the strict-defaults warning and write a settings_change audit line. */
  warnTamper: boolean;
  /** Run (or resume) the setup wizard before routing. */
  runWizard: boolean;
}

/** Pure boot branch logic: settings state in, actions out. */
export function decideBoot(state: BootState): BootDecision {
  return {
    warnTamper: state.tampered,
    runWizard: !state.setupComplete,
  };
}

/** The grown-up and kid help for the command line. */
export function cliHelp(): string {
  return [
    'How to use Termi:',
    '  termi            open the home menu',
    '  termi new        start a new project',
    '  termi go [name]  open a project and build',
    '  termi preview    watch a project run',
    '  termi ideas      get fun ideas',
    '  termi learn      play six short lessons about AI',
    '  termi grownups   grown-up zone (PIN needed)',
    '  termi update     update Termi to the latest version',
    '  termi help       show this help',
    '  termi --version  show the version',
  ].join('\n');
}

function versionString(): string {
  try {
    const raw = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function showTamperWarning(): void {
  console.log(mascot('oops'));
  console.log('Termi found changed settings. Safe settings are on now.');
  console.log(style.dim('A grown-up can review this in the grown-up zone.'));
  try {
    appendAudit({
      ts: new Date().toISOString(),
      layer: 'system',
      event: 'settings_change',
      excerpt: 'settings integrity check failed, strict defaults applied',
    });
  } catch {
    // The warning is what matters most here.
  }
}

async function resolveProject(
  nameArg: string | undefined,
  settings: Settings,
): Promise<ProjectContext | null> {
  let store: typeof import('./projects/store.js');
  try {
    store = await import('./projects/store.js');
  } catch {
    p.log.warn('Project tools are not ready yet.');
    return null;
  }
  if (nameArg !== undefined && nameArg.length > 0) {
    let slug = nameArg.toLowerCase();
    try {
      const create = await import('./projects/create.js');
      slug = create.slugifyName(nameArg).slug;
    } catch {
      // Use the lowercased name as a best-effort slug.
    }
    const direct = store.openProject(slug);
    if (direct !== null) {
      return direct;
    }
    p.log.warn('I cannot find that project. Pick one below.');
  }
  const metas = store.listProjects();
  if (metas.length === 0) {
    p.log.info('No projects yet. Run "termi new" to make one!');
    return null;
  }
  const first = metas[0];
  const initial =
    settings.lastProjectSlug !== null && metas.some((m) => m.slug === settings.lastProjectSlug)
      ? settings.lastProjectSlug
      : first?.slug;
  const pick = await p.select<string>({
    message: 'Pick a project.',
    options: metas.map((m) => ({ value: m.slug, label: m.prettyName })),
    ...(initial !== undefined ? { initialValue: initial } : {}),
  });
  if (p.isCancel(pick)) {
    return null;
  }
  return store.openProject(pick);
}

async function routePreview(nameArg: string | undefined, settings: Settings): Promise<void> {
  const project = await resolveProject(nameArg, settings);
  if (project === null) {
    return;
  }
  const handle = await startPreview(project.dir, { openBrowser: true });
  console.log(`${T.chat.previewOpened} ${style.dim(handle.url)}`);
  console.log(style.dim('Press Ctrl+C when you are done watching.'));
  await new Promise<void>(() => {
    // Held open on purpose; Ctrl+C ends it through the global handler.
  });
}

async function routeIdeas(settings: Settings): Promise<void> {
  let scaffoldId = 'games';
  if (settings.lastProjectSlug !== null) {
    try {
      const store = await import('./projects/store.js');
      const last = store.openProject(settings.lastProjectSlug);
      if (last !== null) {
        scaffoldId = last.meta.scaffoldId;
      }
    } catch {
      // Fall back to game ideas.
    }
  }
  await executeIdeas(scaffoldId, (text) => {
    console.log(text);
  });
}

async function route(command: string, rest: string[], settings: Settings): Promise<void> {
  const home = await import('./surfaces/home.js');
  switch (command) {
    case '': {
      await home.showHome(settings);
      return;
    }
    case 'new': {
      const project = await home.runNewProject(settings);
      if (project !== null) {
        await home.openChatLoop(project, settings);
      }
      return;
    }
    case 'go': {
      const project = await resolveProject(rest[0], settings);
      if (project !== null) {
        await home.openChatLoop(project, settings);
      }
      return;
    }
    case 'preview': {
      await routePreview(rest[0], settings);
      return;
    }
    case 'ideas': {
      await routeIdeas(settings);
      return;
    }
    case 'learn': {
      const learn = await import('./learn/runner.js');
      await learn.runLearnMenu();
      return;
    }
    case 'grownups': {
      const panel = await import('./grownups/panel.js');
      await panel.runPanel();
      return;
    }
    case 'update': {
      const update = await import('./update/prompt.js');
      await update.runUpdateCommand();
      return;
    }
    default: {
      console.log(`Hmm, "${command}" is not a Termi command.`);
      console.log(cliHelp());
      return;
    }
  }
}

/** Full boot and route. Exported for tests; auto-runs outside of them. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const command = argv[0] ?? '';
  if (command === '--version' || command === '-v') {
    console.log(versionString());
    return;
  }
  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(cliHelp());
    return;
  }
  // Update works without the wizard so a parent can refresh a broken install.
  if (command === 'update') {
    ensureDirs();
    const update = await import('./update/prompt.js');
    await update.runUpdateCommand();
    return;
  }

  ensureDirs();
  const loaded = loadSettings();
  let settings = loaded.settings;
  if (loaded.upgraded) {
    // A pre-upgrade envelope carried retired keys; one re-save converges
    // the on-disk file to the current shape with a fresh signature.
    settings = saveSettings(settings);
  }
  const decision = decideBoot({
    firstRun: loaded.firstRun,
    tampered: loaded.tampered,
    setupComplete: isSetupComplete(),
  });

  if (decision.warnTamper) {
    showTamperWarning();
  }
  if (decision.runWizard) {
    const wizard = await import('./setup/wizard.js');
    await wizard.runWizard();
    settings = loadSettings().settings;
    if (!isSetupComplete()) {
      return;
    }
  } else if (command === '') {
    console.log(renderBanner());
  }

  installGlobalHandlers({
    onCrash: (entry) => {
      try {
        fs.appendFileSync(errorLogPath(), entry);
      } catch {
        // Nowhere left to write; the friendly screen still shows.
      }
    },
    logPath: errorLogPath(),
  });

  // Resume the safety-checker download in the background when it is enabled
  // but its model file is not on disk yet (declined-then-enabled, an
  // interrupted transfer, or a wizard quit mid-download). Never blocks.
  if (settings.localClassifier && !guardModelReady()) {
    const { ensureGuardFetch } = await import('./safety/guarddownload.js');
    void ensureGuardFetch();
  }

  // Returning sessions: offer an update when npm has a newer version.
  // Skipped during setup, tests, and TERMI_SKIP_UPDATE=1.
  if (!decision.runWizard) {
    try {
      const update = await import('./update/prompt.js');
      await update.maybePromptForUpdate();
    } catch {
      // Never block boot on the update check.
    }
  }

  await route(command, argv.slice(1), settings);
}

const underTest = process.env.VITEST !== undefined || process.env.NODE_ENV === 'test';
if (!underTest) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      const detail =
        err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err);
      try {
        fs.appendFileSync(errorLogPath(), `[${new Date().toISOString()}] main\n${detail}\n`);
      } catch {
        // Nowhere left to write.
      }
      console.error(renderCrash(errorLogPath()));
      process.exit(1);
    });
}
