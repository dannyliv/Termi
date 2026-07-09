/**
 * In-memory fakes for the agent tests. The real ProjectContext,
 * SnapshotStore, and PreviewHandle belong to other modules; these stand-ins
 * implement just the surface the agent uses, with call recording.
 */

import { Buffer } from 'node:buffer';
import os from 'node:os';
import path from 'node:path';
import type { TurnDeps } from '../src/agent/loop.js';
import { createSessionState } from '../src/safety/session.js';
import type {
  AuditEvent,
  ClassifierVerdict,
  CodeScanResult,
  PrefilterInputResult,
  ProviderId,
  SafetyCategory,
} from '../src/types.js';
import { T } from '../src/ui/text.js';

export function allowedVerdict(): ClassifierVerdict {
  return {
    allowed: true,
    categories: [],
    severity: 0,
    selfHarmConcern: false,
    failClosed: false,
    kidMessage: null,
  };
}

export function blockedVerdict(category: SafetyCategory = 'jailbreak'): ClassifierVerdict {
  return {
    allowed: false,
    categories: [category],
    severity: 2,
    selfHarmConcern: false,
    failClosed: false,
    kidMessage: T.blocks.byCategory[category],
  };
}

export interface TermiMdFields {
  whatThisIs?: string;
  builtSoFar?: string[];
  recapLine?: string;
}

export class FakeProject {
  meta = {
    slug: 'sky-dash',
    prettyName: 'Sky Dash',
    scaffoldId: 'games',
    themeId: 'space',
    createdAt: '2026-06-10T00:00:00.000Z',
    lastOpenedAt: '2026-06-10T00:00:00.000Z',
  };
  dir = path.join(os.tmpdir(), 'termi-fake-project');
  files = new Map<string, string>();
  termiMd = [
    '# Sky Dash',
    '',
    '## What this is',
    'A dodging game in space.',
    '',
    '## Files',
    'index.html, style.css, game.js',
    '',
    '## Built so far',
    '- starter game',
    '',
    '## Recap line',
    'We made the starter game.',
  ].join('\n');
  termiMdUpdates: TermiMdFields[] = [];
  writes: string[] = [];
  touched = 0;

  listKidFiles(): { relPath: string; bytes: number }[] {
    return [...this.files.entries()].map(([relPath, content]) => ({
      relPath,
      bytes: Buffer.byteLength(content, 'utf8'),
    }));
  }
  readFile(relPath: string): string | null {
    return this.files.get(relPath) ?? null;
  }
  writeFile(relPath: string, content: string): void {
    this.files.set(relPath, content);
    this.writes.push(relPath);
  }
  readTermiMd(): string {
    return this.termiMd;
  }
  updateTermiMd(fields: TermiMdFields): void {
    this.termiMdUpdates.push(fields);
  }
  touch(): void {
    this.touched++;
  }
}

export class FakeSafety {
  /** When set, checkInput returns this promise instead of an allow. */
  inputVerdict: Promise<ClassifierVerdict> | null = null;
  outputVerdict: ClassifierVerdict = allowedVerdict();
  scanOk = true;
  scanReasons: string[] = [];
  prefilterBlockVerdict: ClassifierVerdict | null = null;
  /** When set, prefilterInput redacts to this text with the PII notice. */
  redactTo: string | null = null;
  contextMarker = '';
  /** When set, extractVisibleText returns this instead of the stub text. */
  visibleOverride: string | null = null;
  checkInputCalls: string[] = [];
  checkOutputCalls: string[] = [];

  prefilterInput(text: string): PrefilterInputResult {
    if (this.prefilterBlockVerdict !== null) {
      return { ok: false, redacted: text, notice: null, block: this.prefilterBlockVerdict };
    }
    if (this.redactTo !== null) {
      return { ok: true, redacted: this.redactTo, notice: T.chat.piiReminder, block: null };
    }
    return { ok: true, redacted: text, notice: null, block: null };
  }
  prefilterContext(text: string): string {
    return this.contextMarker + text;
  }
  checkInput(text: string): Promise<ClassifierVerdict> {
    this.checkInputCalls.push(text);
    return this.inputVerdict ?? Promise.resolve(allowedVerdict());
  }
  checkOutputText(text: string): Promise<ClassifierVerdict> {
    this.checkOutputCalls.push(text);
    return Promise.resolve(this.outputVerdict);
  }
  scanCode(): CodeScanResult {
    return { ok: this.scanOk, reasons: this.scanReasons };
  }
  extractVisibleText(relPath: string, content: string): string {
    return this.visibleOverride ?? `visible:${relPath}:${content.slice(0, 40)}`;
  }
}

export interface FakeDeps {
  deps: TurnDeps;
  project: FakeProject;
  safety: FakeSafety;
  audits: AuditEvent[];
  activities: string[];
  order: string[];
  notifyCount: () => number;
}

export function makeDeps(
  overrides: { providerId?: ProviderId; model?: unknown } = {},
): FakeDeps {
  const project = new FakeProject();
  project.files.set('index.html', '<!-- the page -->\n<canvas id="sky"></canvas>');
  project.files.set('style.css', '/* space colors */\nbody { background: black; }');
  project.files.set('game.js', '// the game loop\nlet score = 0;\nfunction startGame() {\n}\n');
  const safety = new FakeSafety();
  const audits: AuditEvent[] = [];
  const activities: string[] = [];
  const order: string[] = [];
  let notifies = 0;

  const originalWrite = project.writeFile.bind(project);
  project.writeFile = (relPath: string, content: string): void => {
    order.push(`write:${relPath}`);
    originalWrite(relPath, content);
  };

  const deps = {
    provider: {
      id: overrides.providerId ?? 'anthropic',
      languageModel: () => overrides.model ?? null,
      moderationEndpoint: false,
    },
    modelAlias: 'zippy',
    safety,
    session: createSessionState(),
    project,
    snapshots: {
      beginTurn: () => {
        order.push('beginTurn');
      },
      undo: () => false,
      redo: () => false,
    },
    preview: {
      url: 'http://127.0.0.1:4311',
      port: 4311,
      notifyChange: () => {
        notifies++;
        order.push('notify');
      },
      stop: async () => {},
    },
    audit: (e: AuditEvent) => {
      audits.push(e);
    },
    ui: {
      onActivity: (line: string) => {
        activities.push(line);
      },
    },
  } as unknown as TurnDeps;

  return { deps, project, safety, audits, activities, order, notifyCount: () => notifies };
}
