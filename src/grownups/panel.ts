/**
 * The grown-ups panel: PIN gate, needs-attention banner, provider
 * management, the on-device safety checker, model speed, the usage note,
 * the audit log viewer, and the data/uninstall screen.
 *
 * The pure helpers (one-liners, attention lines, log parsing) are exported
 * so tests cover them without driving the prompts.
 */

import fs from 'node:fs';
import * as p from '@clack/prompts';
import { API_KEY_ACCOUNTS, deleteSecret, isFallbackActive, KEYCHAIN_SERVICE } from '../auth/keychain.js';
import { clearTokens, hasTokens, loadTokens } from '../auth/tokens.js';
import { hasPin, resetPin, verifyPin } from '../config/pin.js';
import {
  auditLogPath,
  authJsonPath,
  modelsDir,
  projectsDir,
  settingsPath,
  termiHome,
} from '../config/paths.js';
import { defaultSettings, loadSettings, saveSettings } from '../config/settings.js';
import { moderationKeyAccessor } from '../providers/index.js';
import { modelLabel } from '../providers/models.js';
import { appendAudit, verifyAuditChain } from '../safety/audit.js';
import { ensureGuardFetch, guardProgressBar } from '../safety/guarddownload.js';
import { GUARD_MODEL, guardModelReady, removeGuardModel } from '../safety/modelstore.js';
import { style } from '../ui/theme.js';
import { T } from '../ui/text.js';
import type { ModelAlias, ProviderId, Settings } from '../types.js';
import { configureProvider, KEY_ACCOUNT, providerLabel } from '../setup/wizard.js';

/** One parsed line from the audit log, chain fields removed. */
export interface AuditLine {
  ts: string;
  layer: string;
  event: string;
  category?: string;
  severity?: number;
  direction?: string;
}

/** Parses audit JSONL into display lines. Skips anchors and bad lines. */
export function parseAuditLog(raw: string): AuditLine[] {
  const out: AuditLine[] = [];
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed['anchor'] === true) {
        continue;
      }
      if (typeof parsed.ts !== 'string' || typeof parsed.event !== 'string') {
        continue;
      }
      const entry: AuditLine = {
        ts: parsed.ts,
        layer: typeof parsed.layer === 'string' ? parsed.layer : 'system',
        event: parsed.event,
      };
      if (typeof parsed.category === 'string') {
        entry.category = parsed.category;
      }
      if (typeof parsed.severity === 'number') {
        entry.severity = parsed.severity;
      }
      if (typeof parsed.direction === 'string') {
        entry.direction = parsed.direction;
      }
      out.push(entry);
    } catch {
      // A bad line is the chain verifier's problem, not the viewer's.
    }
  }
  return out;
}

function shortTime(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return ts;
  }
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const EVENT_PHRASES: Record<string, string> = {
  block: 'a message was blocked',
  redact: 'private info was hidden',
  fail_closed: 'a safety check could not finish, so Termi paused',
  settings_change: 'settings changed',
  pin_fail: 'a wrong PIN was tried',
  pin_reset: 'the PIN was reset',
  provider_change: 'the AI helper account changed',
  consent: 'consent was recorded',
  auth_dead: 'the sign-in stopped working',
};

/**
 * A neutral one-line summary of an audit entry: time, layer, what happened,
 * category when present. Grooming flags get a loud, unmistakable prefix.
 */
export function auditOneLiner(entry: AuditLine): string {
  const time = shortTime(entry.ts);
  const cat = entry.category !== undefined ? ` (${entry.category})` : '';
  if (entry.event === 'grooming_flag') {
    return `!! ${time}  REVIEW FIRST: a chat raised a grooming warning${cat}. Please talk with your kid.`;
  }
  const phrase = EVENT_PHRASES[entry.event] ?? entry.event;
  return `${time}  [${entry.layer}] ${phrase}${cat}`;
}

export interface AttentionState {
  /** The ChatGPT sign-in is missing or marked dead while it is the active provider. */
  authDead: boolean;
  /** Secrets are in the fallback file, not the OS keychain. */
  fallbackKeychain: boolean;
}

/** Reads the live attention state for the banner. */
export function collectAttention(settings: Settings): AttentionState {
  const tokens = loadTokens();
  const authDead =
    settings.activeProvider === 'openai-chatgpt' && (tokens === null || tokens.dead === true);
  return { authDead, fallbackKeychain: isFallbackActive() };
}

/** Banner lines for the attention state. Empty means all is well. */
export function needsAttentionLines(state: AttentionState): string[] {
  const lines: string[] = [];
  if (state.authDead) {
    lines.push('The ChatGPT sign-in stopped working. Sign in again under Providers.');
  }
  if (state.fallbackKeychain) {
    lines.push(
      'Secrets are stored in a plain file, not the system keychain. That is less protected.',
    );
  }
  return lines;
}

/** Plain-language note on how many AI calls one kid message makes. */
export function usageNote(
  activeProvider: ProviderId | null,
  freeModeration: boolean,
): string {
  const lines: string[] = [
    'Each kid message makes up to 3 AI calls:',
    '  1. A safety check on the message.',
    '  2. The build call that writes code.',
    '  3. A safety check on the answer.',
    'Each file the AI changes adds one more safety check.',
  ];
  if (freeModeration) {
    lines.push('Safety checks here use a free checker. They do not use your plan.');
  } else if (activeProvider === 'openai-chatgpt') {
    lines.push('On the ChatGPT sign-in, safety checks share your plan quota.');
  } else {
    lines.push('Safety checks use your API account, like the build calls.');
  }
  lines.push('If Termi runs out of energy, it comes back when your plan resets.');
  return lines.join('\n');
}

function audit(event: 'settings_change' | 'pin_reset' | 'provider_change', excerpt: string): void {
  try {
    appendAudit({ ts: new Date().toISOString(), layer: 'system', event, excerpt });
  } catch {
    // Best effort.
  }
}

async function forgotPinFlow(): Promise<void> {
  const sure = await p.confirm({
    message:
      'Resetting wipes the PIN and every AI key, and turns strict settings back on. Continue?',
    initialValue: false,
  });
  if (p.isCancel(sure) || !sure) {
    return;
  }
  resetPin();
  try {
    saveSettings(defaultSettings());
  } catch {
    // Strict defaults are also what a missing file loads as.
  }
  audit('pin_reset', 'forgot-pin wipe, strict defaults restored');
  p.log.info('Done. Setup will run again so you can add a new PIN and provider.');
  try {
    const wizard = await import('../setup/wizard.js');
    await wizard.runWizard();
  } catch {
    p.log.warn('Run termi again to redo setup.');
  }
}

/**
 * PIN gate for grown-up areas. True when verified. Handles lockout
 * messaging and the forgot-PIN wipe path.
 */
export async function pinGate(): Promise<boolean> {
  if (!hasPin()) {
    return true;
  }
  for (;;) {
    const entry = await p.password({ message: T.grownups.pinPrompt });
    if (p.isCancel(entry)) {
      return false;
    }
    const result = verifyPin(entry);
    if (result.ok) {
      return true;
    }
    if (result.lockedForSeconds !== undefined) {
      const minutes = Math.max(1, Math.ceil(result.lockedForSeconds / 60));
      p.log.warn(T.grownups.lockout.replace('{minutes}', String(minutes)));
      return false;
    }
    p.log.warn(T.grownups.wrongPin);
    const next = await p.select<string>({
      message: 'What now?',
      options: [
        { value: 'retry', label: 'Try again' },
        { value: 'forgot', label: 'I forgot the PIN' },
        { value: 'back', label: 'Go back' },
      ],
    });
    if (p.isCancel(next) || next === 'back') {
      return false;
    }
    if (next === 'forgot') {
      await forgotPinFlow();
      return false;
    }
  }
}

/**
 * Pure settings transition for removing one provider: drops it from the
 * configured list and moves the active pointer to the first remaining
 * provider (or null). Exported so tests cover it without the prompts.
 */
export function removeProviderFromSettings(settings: Settings, id: ProviderId): Settings {
  const configured = settings.configuredProviders.filter((p) => p !== id);
  const active =
    settings.activeProvider === id ? (configured[0] ?? null) : settings.activeProvider;
  return { ...settings, configuredProviders: configured, activeProvider: active };
}

/** Deletes the stored credential for one provider (key or sign-in tokens). */
function deleteProviderCredential(id: ProviderId): void {
  if (id === 'openai-chatgpt') {
    clearTokens();
    return;
  }
  deleteSecret(KEY_ACCOUNT[id]);
}

async function providersMenu(settings: Settings): Promise<Settings> {
  let current = settings;
  for (;;) {
    const configuredNote =
      current.configuredProviders.length > 0
        ? current.configuredProviders
            .map(
              (id) =>
                `${providerLabel(id)}${id === current.activeProvider ? ' (active)' : ''}`,
            )
            .join(', ')
        : 'none yet';
    p.log.info(`Configured: ${configuredNote}`);
    const pick = await p.select<string>({
      message: 'Providers',
      options: [
        { value: 'add', label: 'Add a provider' },
        ...(current.configuredProviders.length > 0
          ? [
              { value: 'switch', label: 'Switch the active provider' },
              { value: 'remove', label: 'Remove a provider' },
            ]
          : []),
        { value: 'back', label: 'Back' },
      ],
    });
    if (p.isCancel(pick) || pick === 'back') {
      return current;
    }
    if (pick === 'add') {
      const updated = await configureProvider(current);
      if (updated !== null) {
        current = updated;
        if (current.activeProvider === null && current.configuredProviders.length > 0) {
          current = { ...current, activeProvider: current.configuredProviders[0] ?? null };
        }
        current = saveSettings(current);
      }
    } else if (pick === 'switch') {
      const active = await p.select<ProviderId>({
        message: 'Which one should Termi use?',
        options: current.configuredProviders.map((id) => ({
          value: id,
          label: providerLabel(id),
        })),
        ...(current.activeProvider !== null ? { initialValue: current.activeProvider } : {}),
      });
      if (!p.isCancel(active)) {
        current = saveSettings({ ...current, activeProvider: active });
        audit('provider_change', `active ${active}`);
      }
    } else if (pick === 'remove') {
      const target = await p.select<ProviderId>({
        message: 'Which one should Termi forget?',
        options: current.configuredProviders.map((id) => ({
          value: id,
          label: providerLabel(id),
        })),
      });
      if (p.isCancel(target)) {
        continue;
      }
      const sure = await p.confirm({
        message: `Remove ${providerLabel(target)}? Its saved key or sign-in is deleted.`,
        initialValue: false,
      });
      if (p.isCancel(sure) || !sure) {
        continue;
      }
      deleteProviderCredential(target);
      current = saveSettings(removeProviderFromSettings(current, target));
      audit('provider_change', `removed ${target}`);
      p.log.success(`${providerLabel(target)} is removed.`);
    }
  }
}

function showAuditViewer(): void {
  const verification = verifyAuditChain();
  if (verification.ok) {
    p.log.success(`Log check: good. ${verification.entries} entries, none changed.`);
  } else {
    p.log.warn(
      `Log check: problem at line ${verification.firstBadLine ?? 0}. Entries may be missing or changed.`,
    );
  }
  let raw = '';
  try {
    raw = fs.readFileSync(auditLogPath(), 'utf8');
  } catch {
    raw = '';
  }
  const entries = parseAuditLog(raw);
  const recent = entries.slice(-20);
  if (recent.length === 0) {
    p.log.info('No events yet. That is good news.');
    return;
  }
  const grooming = recent.filter((e) => e.event === 'grooming_flag');
  if (grooming.length > 0) {
    p.log.warn(`${grooming.length} grooming warning(s) below. Read those first.`);
  }
  for (const entry of recent) {
    const line = auditOneLiner(entry);
    console.log(entry.event === 'grooming_flag' ? style.bad(line) : line);
  }
}

function showDataScreen(): void {
  const accounts = ['pin-hash', 'setup-marker', 'hmac-key', 'install-id', ...API_KEY_ACCOUNTS];
  p.note(
    [
      `Settings: ${settingsPath()}`,
      `State folder: ${termiHome()}`,
      `Kid projects: ${projectsDir()}`,
      `Audit log: ${auditLogPath()}`,
      `Sign-in tokens: ${authJsonPath()}`,
      `Safety model: ${modelsDir()}`,
      `Keychain service: ${KEYCHAIN_SERVICE}`,
      `Keychain accounts: ${accounts.join(', ')}`,
      '',
      'To remove Termi fully, delete those folders and keychain entries.',
      'Kid projects are plain files. Keep them if you want the games.',
    ].join('\n'),
    'Your data',
  );
}

/** One-line status for the on-device safety checker menu row. */
export function guardStatusLine(settings: Settings): string {
  if (!settings.localClassifier) {
    return 'off';
  }
  return guardModelReady() ? 'on' : 'on, model not downloaded';
}

/** Manage the on-device safety checker: toggle, download, remove. */
async function guardMenu(settings: Settings): Promise<Settings> {
  const ready = guardModelReady();
  p.note(
    [
      `${GUARD_MODEL.name} screens every message on this computer,`,
      'even with no internet. It checks: violence, illegal acts, sexual content,',
      'personal details, self-harm, unethical acts, heavy political topics,',
      'copying others\' work, and rule-breaking attempts.',
      `Model file: ${ready ? 'downloaded' : `not downloaded (${GUARD_MODEL.displaySize})`}`,
    ].join('\n'),
    'Safety checker',
  );
  const options: { value: string; label: string }[] = [];
  if (!settings.localClassifier) {
    options.push({ value: 'on', label: 'Turn it on' });
  } else {
    options.push({ value: 'off', label: 'Turn it off' });
  }
  if (!ready) {
    options.push({ value: 'download', label: `Download the model (${GUARD_MODEL.displaySize})` });
  } else {
    options.push({ value: 'remove', label: 'Remove the model file' });
  }
  options.push({ value: 'back', label: 'Back' });
  const pick = await p.select<string>({ message: 'Safety checker', options });
  if (p.isCancel(pick) || pick === 'back') {
    return settings;
  }
  if (pick === 'on' || pick === 'off') {
    const next = saveSettings({ ...settings, localClassifier: pick === 'on' });
    audit('settings_change', `local classifier ${pick}`);
    return next;
  }
  if (pick === 'remove') {
    // Removing the file also turns the checker off; otherwise the next
    // start would silently re-download 623 MB against the parent's intent.
    removeGuardModel();
    const next = saveSettings({ ...settings, localClassifier: false });
    audit('settings_change', 'local classifier model removed and turned off');
    p.log.info('Removed the model file and turned the checker off.');
    return next;
  }
  // Joins the background fetch when one is already running (the shared
  // manager is single-flight), otherwise starts it, and shows a live bar.
  const spin = p.spinner();
  spin.start(`${T.wizard.guardDownloading} ${guardProgressBar()}`);
  const ticker = setInterval(() => {
    spin.message(`${T.wizard.guardDownloading} ${guardProgressBar()}`);
  }, 250);
  const ok = await ensureGuardFetch();
  clearInterval(ticker);
  spin.stop(ok ? T.wizard.guardReady : T.wizard.guardFailed);
  return settings;
}

/** The PIN-gated grown-ups panel. */
export async function runPanel(): Promise<void> {
  const ok = await pinGate();
  if (!ok) {
    return;
  }
  let settings = loadSettings().settings;

  const attention = needsAttentionLines(collectAttention(settings));
  if (attention.length > 0) {
    p.note(attention.join('\n'), T.grownups.needsAttention);
  }
  if (settings.activeProvider === 'openai-chatgpt' && !hasTokens()) {
    p.log.warn(T.errors.auth);
  }

  for (;;) {
    const pick = await p.select<string>({
      message: 'Grown-up zone',
      options: [
        { value: 'providers', label: 'Providers (add or switch)' },
        { value: 'guard', label: `Safety checker on this computer (${guardStatusLine(settings)})` },
        { value: 'speed', label: `Model speed (now: ${modelLabel(settings.modelAlias)})` },
        { value: 'usage', label: 'Usage and quota note' },
        { value: 'audit', label: 'Safety log' },
        { value: 'data', label: 'Your data and uninstall' },
        { value: 'exit', label: 'Exit' },
      ],
    });
    if (p.isCancel(pick) || pick === 'exit') {
      p.outro('Closed the grown-up zone.');
      return;
    }
    if (pick === 'providers') {
      settings = await providersMenu(settings);
    } else if (pick === 'guard') {
      settings = await guardMenu(settings);
    } else if (pick === 'speed') {
      const alias = await p.select<ModelAlias>({
        message: 'Pick the model speed.',
        options: [
          { value: 'zippy', label: modelLabel('zippy'), hint: 'Fast and good. Uses less quota.' },
          { value: 'smart', label: modelLabel('smart'), hint: 'Slower, for tricky asks.' },
        ],
        initialValue: settings.modelAlias,
      });
      if (!p.isCancel(alias) && alias !== settings.modelAlias) {
        settings = saveSettings({ ...settings, modelAlias: alias });
        audit('settings_change', `model speed ${alias}`);
      }
    } else if (pick === 'usage') {
      console.log(usageNote(settings.activeProvider, moderationKeyAccessor() !== null));
    } else if (pick === 'audit') {
      showAuditViewer();
    } else if (pick === 'data') {
      showDataScreen();
    }
  }
}
