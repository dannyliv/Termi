/**
 * The setup wizard: a parent flow (PIN, consent, AI provider, safety
 * checker) followed by a kid flow (nickname, AI disclosure, launcher,
 * first game).
 *
 * Pure decision helpers are exported so tests cover the logic without
 * driving the prompts. Cancel anywhere keeps only the steps that finished;
 * the setup marker is written near the end, so the next run resumes here.
 */

import * as p from '@clack/prompts';
import { loginWithChatGPT } from '../auth/oauth.js';
import { setSecret } from '../auth/keychain.js';
import { hasPin, markSetupComplete, setPin } from '../config/pin.js';
import { defaultSettings, loadSettings, saveSettings } from '../config/settings.js';
import { appendAudit } from '../safety/audit.js';
import { ensureGuardFetch, guardProgressBar } from '../safety/guarddownload.js';
import { guardModelReady } from '../safety/modelstore.js';
import { nameIsOkay } from '../safety/prefilter.js';
import { renderBanner } from '../ui/banner.js';
import { mascot } from '../ui/mascot.js';
import { style } from '../ui/theme.js';
import { T } from '../ui/text.js';
import type { AuditEvent, ProviderId, Settings } from '../types.js';
import { writeLauncher } from './launcher.js';

export type ProviderChoice = ProviderId | 'skip';

export interface ProviderOption {
  value: ProviderChoice;
  label: string;
  hint?: string;
}

/** The provider picker rows. ChatGPT sign-in always leads. */
export function providerOptions(): ProviderOption[] {
  return [
    {
      value: 'openai-chatgpt',
      label: 'ChatGPT sign-in',
      hint: 'Sign in with your browser. No key needed.',
    },
    { value: 'anthropic', label: 'Claude API key' },
    { value: 'openai-api', label: 'OpenAI API key' },
    { value: 'xai', label: 'Grok API key', hint: 'Adults only. One extra step.' },
    { value: 'skip', label: 'Skip for now', hint: 'You can add one later.' },
  ];
}

/** Friendly display name for a provider. */
export function providerLabel(id: ProviderId): string {
  switch (id) {
    case 'openai-chatgpt':
      return 'ChatGPT sign-in';
    case 'openai-api':
      return 'OpenAI key';
    case 'anthropic':
      return 'Claude key';
    case 'xai':
      return 'Grok key';
  }
}

/**
 * Gate for storing a Grok key: the parent must explicitly confirm the
 * 18+ API terms acknowledgment first. No confirmation, no key.
 */
export function grokKeyAllowed(parentAckConfirmed: boolean): boolean {
  return parentAckConfirmed === true;
}

const NAME_STARTS = ['Super', 'Mega', 'Turbo', 'Cosmic', 'Pixel', 'Lucky'];
const NAME_ENDS = ['Quest', 'Dash', 'World', 'Party', 'Lab', 'Zone'];

/** Three distinct project name ideas built from a theme label. */
export function suggestProjectNames(
  themeLabel: string,
  rng: () => number = Math.random,
): string[] {
  const core = themeLabel.trim().replace(/\s+/g, ' ') || 'Game';
  const pick = (pool: string[]): string =>
    pool[Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)))] ?? pool[0]!;
  const candidates = [`${pick(NAME_STARTS)} ${core}`, `${core} ${pick(NAME_ENDS)}`, `My ${core}`];
  const out: string[] = [];
  for (const candidate of candidates) {
    if (!out.includes(candidate)) {
      out.push(candidate);
    }
  }
  let n = 2;
  while (out.length < 3) {
    out.push(`${core} ${n}`);
    n += 1;
  }
  return out.slice(0, 3);
}

function audit(event: AuditEvent['event'], excerpt: string): void {
  try {
    appendAudit({ ts: new Date().toISOString(), layer: 'system', event, excerpt });
  } catch {
    // The wizard never falls over because the audit disk write failed.
  }
}

/** Cancel anywhere: exit kindly, keep what finished, resume next run. */
function bail(): never {
  p.cancel('Okay! We can finish setup next time you start Termi.');
  process.exit(0);
}

function ensure<V>(value: V | symbol): V {
  if (p.isCancel(value)) {
    bail();
  }
  return value as V;
}

export const KEY_ACCOUNT: Record<Exclude<ProviderId, 'openai-chatgpt'>, string> = {
  'openai-api': 'api-key-openai-api',
  anthropic: 'api-key-anthropic',
  xai: 'api-key-xai',
};

interface PingTarget {
  url: string;
  headers: Record<string, string>;
}

function pingTarget(id: Exclude<ProviderId, 'openai-chatgpt'>, key: string): PingTarget {
  switch (id) {
    case 'openai-api':
      return { url: 'https://api.openai.com/v1/models', headers: { authorization: `Bearer ${key}` } };
    case 'anthropic':
      return {
        url: 'https://api.anthropic.com/v1/models',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      };
    case 'xai':
      return { url: 'https://api.x.ai/v1/models', headers: { authorization: `Bearer ${key}` } };
  }
}

/**
 * Best-effort live key check. "bad" only on a clear 401/403.
 * Offline or anything odd reports "unknown" and is treated as fine.
 */
export async function validateApiKey(
  id: Exclude<ProviderId, 'openai-chatgpt'>,
  key: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<'ok' | 'bad' | 'unknown'> {
  try {
    const target = pingTarget(id, key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetchImpl(target.url, {
        headers: target.headers,
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) {
        return 'bad';
      }
      return 'ok';
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return 'unknown';
  }
}

async function addChatgptProvider(settings: Settings): Promise<Settings | null> {
  const s = p.spinner();
  s.start('Opening the browser so you can sign in...');
  try {
    const result = await loginWithChatGPT({
      openBrowser: true,
      onAuthorizeUrl: (url) => {
        s.message('Waiting for the sign-in to finish in your browser...');
        p.log.message(style.dim(`If the browser did not open, use this link:\n${url}`));
      },
    });
    s.stop(`Signed in! Plan: ${result.planType}`);
    audit('provider_change', 'added openai-chatgpt');
    const configured = settings.configuredProviders.includes('openai-chatgpt')
      ? settings.configuredProviders
      : [...settings.configuredProviders, 'openai-chatgpt' as ProviderId];
    return { ...settings, configuredProviders: configured };
  } catch {
    s.stop('That sign-in did not finish. You can try again later.');
    return null;
  }
}

async function addKeyProvider(
  id: Exclude<ProviderId, 'openai-chatgpt'>,
  settings: Settings,
): Promise<Settings | null> {
  let next = { ...settings };
  if (id === 'xai' && !next.xaiParentAck) {
    const agreed = await p.confirm({
      message: `${T.wizard.xaiAck} Do you confirm this?`,
      initialValue: false,
    });
    if (p.isCancel(agreed)) {
      bail();
    }
    if (!grokKeyAllowed(agreed === true)) {
      p.log.info('Skipped Grok. Pick another helper, or add Grok later.');
      return null;
    }
    next = { ...next, xaiParentAck: true };
    audit('settings_change', 'xai parent ack confirmed');
  }
  for (;;) {
    const key = ensure(
      await p.password({
        message: `Paste the ${providerLabel(id)} now.`,
        validate: (value) =>
          value && value.trim().length > 0 ? undefined : 'The key cannot be empty.',
      }),
    ).trim();
    const s = p.spinner();
    s.start('Checking the key...');
    const verdict = await validateApiKey(id, key);
    if (verdict === 'bad') {
      // A clearly rejected key is never saved or marked configured.
      s.stop('That key did not work.');
      const again = await p.confirm({ message: 'Try a different key?', initialValue: true });
      if (p.isCancel(again)) {
        bail();
      }
      if (again) {
        continue;
      }
      return null;
    }
    setSecret(KEY_ACCOUNT[id], key);
    s.stop('Key saved.');
    break;
  }
  audit('provider_change', `added ${id}`);
  const configured = next.configuredProviders.includes(id)
    ? next.configuredProviders
    : [...next.configuredProviders, id];
  return { ...next, configuredProviders: configured };
}

/**
 * One provider add flow, shared by the wizard and the grown-ups panel.
 * Returns updated settings, or null only when the parent picked Skip.
 * A failed sign-in or a declined acknowledgment loops back to the picker,
 * so the parent is never dead-ended out of the provider step.
 * Secrets persist immediately; the caller persists the settings.
 */
export async function configureProvider(settings: Settings): Promise<Settings | null> {
  for (;;) {
    const choice = await p.select<ProviderChoice>({
      message: T.wizard.providerPick,
      options: providerOptions().map((o) => ({
        value: o.value,
        label: o.label,
        ...(o.hint !== undefined ? { hint: o.hint } : {}),
      })),
      initialValue: 'openai-chatgpt',
    });
    if (p.isCancel(choice)) {
      bail();
    }
    if (choice === 'skip') {
      return null;
    }
    const updated =
      choice === 'openai-chatgpt'
        ? await addChatgptProvider(settings)
        : await addKeyProvider(choice, settings);
    if (updated !== null) {
      return updated;
    }
  }
}

async function createPinStep(): Promise<void> {
  if (hasPin()) {
    p.log.info('A grown-up PIN is already set. We will keep it.');
    return;
  }
  for (;;) {
    const first = ensure(
      await p.password({
        message: T.wizard.pinCreate,
        validate: (value) =>
          value && value.trim().length >= 4 ? undefined : 'Use at least 4 characters.',
      }),
    );
    const second = ensure(await p.password({ message: T.wizard.pinConfirm }));
    if (first === second) {
      setPin(first);
      p.log.success('PIN saved.');
      return;
    }
    p.log.warn('Those did not match. Let us try again.');
  }
}

async function consentStep(settings: Settings): Promise<Settings> {
  // One safety bar for every age. No under-13 / over-13 split.
  const agreed = ensure(
    await p.confirm({ message: `${T.wizard.consentIntro} Do you agree?`, initialValue: true }),
  );
  if (!agreed) {
    bail();
  }
  const attestedAt = new Date().toISOString();
  try {
    appendAudit({
      ts: attestedAt,
      layer: 'system',
      event: 'consent',
      excerpt: 'parent consent, one safety bar for all ages',
    });
  } catch {
    // Consent still counts; the audit line is best effort.
  }
  return { ...settings, ageBand: 'under13', consentAttestedAt: attestedAt };
}

async function providerLoop(settings: Settings): Promise<Settings> {
  let current = settings;
  for (;;) {
    const updated = await configureProvider(current);
    if (updated === null) {
      if (current.configuredProviders.length === 0) {
        p.log.info(`${T.offline.noProvider} ${T.offline.stillWorks}`);
      }
      break;
    }
    current = updated;
    const more = ensure(
      await p.confirm({ message: 'Add another AI helper account?', initialValue: false }),
    );
    if (!more) {
      break;
    }
  }
  if (current.configuredProviders.length === 1) {
    return { ...current, activeProvider: current.configuredProviders[0] ?? null };
  }
  if (current.configuredProviders.length > 1) {
    const active = ensure(
      await p.select<ProviderId>({
        message: 'Which one should Termi use?',
        options: current.configuredProviders.map((id) => ({ value: id, label: providerLabel(id) })),
        initialValue: current.configuredProviders[0],
      }),
    );
    return { ...current, activeProvider: active };
  }
  return { ...current, activeProvider: null };
}

/**
 * Installs the on-device safety checker as part of setup. Always on: the
 * model download starts here (and resumes on later boots). Parent can wait
 * for the bar or keep going; declining is not offered.
 */
async function localGuardStep(settings: Settings): Promise<Settings> {
  if (guardModelReady()) {
    return { ...settings, localClassifier: true };
  }
  p.log.info(T.wizard.guardOffer);
  const fetchDone = ensureGuardFetch();
  p.log.info(T.wizard.guardBackground);
  audit('settings_change', 'local classifier install started in setup');
  const wait = ensure(
    await p.select<'now' | 'wait'>({
      message: T.wizard.guardWaitPick,
      options: [
        { value: 'wait', label: T.wizard.guardWaitHere, hint: T.wizard.guardWaitHereHint },
        { value: 'now', label: T.wizard.guardStartNow, hint: T.wizard.guardStartNowHint },
      ],
      initialValue: 'wait',
    }),
  );
  if (wait === 'wait') {
    const escapeAfterMs = [60_000, 600_000];
    let escapeIndex = 0;
    for (;;) {
      const spin = p.spinner();
      spin.start(`${T.wizard.guardDownloading} ${guardProgressBar()}`);
      const ticker = setInterval(() => {
        spin.message(`${T.wizard.guardDownloading} ${guardProgressBar()}`);
      }, 250);
      const budget = escapeAfterMs[Math.min(escapeIndex, escapeAfterMs.length - 1)]!;
      escapeIndex += 1;
      const outcome = await Promise.race([
        fetchDone.then((ok) => (ok ? 'ready' : 'failed')),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), budget).unref?.()),
      ]);
      clearInterval(ticker);
      if (outcome !== 'timeout') {
        spin.stop(outcome === 'ready' ? T.wizard.guardReady : T.wizard.guardFailed);
        break;
      }
      spin.stop(`${T.wizard.guardDownloading} ${guardProgressBar()}`);
      const more = await p.confirm({ message: T.wizard.guardKeepWaiting, initialValue: true });
      if (p.isCancel(more) || !more) {
        p.log.info(T.wizard.guardBackground);
        break;
      }
    }
  }
  return { ...settings, localClassifier: true };
}

async function kidNicknameStep(settings: Settings): Promise<Settings> {
  console.log(mascot('happy'));
  console.log(T.wizard.kidHello);
  const nickname = ensure(
    await p.text({
      message: T.wizard.nicknamePrompt,
      placeholder: 'Like RocketFox or PixelPanda',
      validate: (value) => {
        const trimmed = (value ?? '').trim();
        if (trimmed.length === 0) return 'Pick any fun name. It cannot be empty.';
        if (trimmed.length > 24) return 'Keep it under 24 letters.';
        if (!nameIsOkay(trimmed)) return 'That name will not work. Pick a made-up one.';
        return undefined;
      },
    }),
  ).trim();
  return { ...settings, kidNickname: nickname };
}

async function firstGameStep(settings: Settings): Promise<void> {
  const wants = await p.confirm({ message: T.wizard.firstGameOffer, initialValue: true });
  if (p.isCancel(wants) || !wants) {
    return;
  }
  try {
    const build = await import('../surfaces/buildGame.js');
    await build.runBuildGame(settings);
  } catch {
    p.log.warn('I could not start the game yet. Try Build a game next time.');
  }
}

/** Runs the full setup wizard, parent flow then kid flow. */
export async function runWizard(): Promise<void> {
  console.log(renderBanner());
  p.intro(T.wizard.parentIntro);

  await createPinStep();
  let settings: Settings = { ...loadSettings().settings };
  if (settings.version !== 1) {
    settings = defaultSettings();
  }
  settings = await consentStep(settings);
  settings = await providerLoop(settings);
  settings = await localGuardStep(settings);
  settings = saveSettings(settings);
  markSetupComplete();

  p.note(T.wizard.handToKid, 'All set');
  settings = await kidNicknameStep(settings);
  settings = saveSettings(settings);
  p.note(T.wizard.aiDisclosure, 'One thing to know');

  const wantsLauncher = await p.confirm({
    message: 'Make a Termi shortcut on the Desktop?',
    initialValue: true,
  });
  if (!p.isCancel(wantsLauncher) && wantsLauncher) {
    const written = writeLauncher();
    if (written !== null) {
      p.log.success(T.wizard.launcherMade);
    }
  }

  await firstGameStep(settings);
  p.outro('Setup is done. Happy building!');
}
