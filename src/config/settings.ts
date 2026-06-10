/**
 * Signed settings persistence.
 *
 * settings.json holds a SettingsEnvelope: the Settings body plus an
 * HMAC-SHA256 over its canonical JSON. The HMAC key lives in the keychain
 * (account "hmac-key", random 32 bytes, created on first use). Any mismatch,
 * parse failure, or missing-file-while-setup-marker-exists condition fails
 * closed to the strictest defaults with tampered: true so the caller can
 * force PIN-gated recovery.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Settings, SettingsEnvelope } from '../types.js';
import { getSecret, setSecret } from '../auth/keychain.js';
import { atomicWriteFileSync, settingsPath } from './paths.js';

const HMAC_KEY_ACCOUNT = 'hmac-key';
const SETUP_MARKER_ACCOUNT = 'setup-marker';

export interface LoadSettingsResult {
  settings: Settings;
  /** True when the file is missing-but-expected, unparseable, or fails the MAC. */
  tampered: boolean;
  /** True only when no settings file exists and setup never completed. */
  firstRun: boolean;
}

/** The strictest possible configuration. Used as the fail-closed baseline. */
export function defaultSettings(): Settings {
  return {
    version: 1,
    installId: '',
    kidNickname: '',
    ageBand: 'under13',
    consentAttestedAt: null,
    activeProvider: null,
    configuredProviders: [],
    modelAlias: 'zippy',
    safetyLevel: 'strict',
    xaiParentAck: false,
    ollamaClassifier: false,
    lastProjectSlug: null,
  };
}

/** Stable stringify: object keys sorted recursively, array order preserved. */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortValue(source[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function hmacKey(): Buffer {
  const existing = getSecret(HMAC_KEY_ACCOUNT);
  if (existing) {
    const key = Buffer.from(existing, 'hex');
    if (key.length === 32) {
      return key;
    }
  }
  const fresh = crypto.randomBytes(32);
  setSecret(HMAC_KEY_ACCOUNT, fresh.toString('hex'));
  return fresh;
}

function signSettings(settings: Settings): string {
  return crypto.createHmac('sha256', hmacKey()).update(canonicalJson(settings)).digest('hex');
}

function isEnvelopeShape(value: unknown): value is SettingsEnvelope {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { settings?: unknown; mac?: unknown };
  return (
    typeof candidate.mac === 'string' &&
    candidate.settings !== null &&
    typeof candidate.settings === 'object' &&
    (candidate.settings as { version?: unknown }).version === 1
  );
}

function macMatches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function loadSettings(): LoadSettingsResult {
  const file = settingsPath();

  if (!fs.existsSync(file)) {
    const setupMarkerExists = getSecret(SETUP_MARKER_ACCOUNT) !== null;
    if (setupMarkerExists) {
      // Setup finished before, yet the file is gone. Someone removed state.
      return { settings: defaultSettings(), tampered: true, firstRun: false };
    }
    return { settings: defaultSettings(), tampered: false, firstRun: true };
  }

  let envelope: SettingsEnvelope;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isEnvelopeShape(parsed)) {
      return { settings: defaultSettings(), tampered: true, firstRun: false };
    }
    envelope = parsed;
  } catch {
    return { settings: defaultSettings(), tampered: true, firstRun: false };
  }

  const expectedMac = signSettings(envelope.settings);
  if (!macMatches(expectedMac, envelope.mac)) {
    return { settings: defaultSettings(), tampered: true, firstRun: false };
  }

  return { settings: envelope.settings, tampered: false, firstRun: false };
}

/**
 * Signs and writes settings atomically. Generates installId on first save.
 * Returns the settings exactly as persisted.
 */
export function saveSettings(settings: Settings): Settings {
  const toSave: Settings = { ...settings };
  if (toSave.installId === '') {
    toSave.installId = crypto.randomUUID();
  }
  const envelope: SettingsEnvelope = { settings: toSave, mac: signSettings(toSave) };
  atomicWriteFileSync(settingsPath(), JSON.stringify(envelope, null, 2), 0o600);
  return toSave;
}
