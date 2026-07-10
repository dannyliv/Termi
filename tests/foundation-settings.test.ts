import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SettingsEnvelope } from '../src/types.js';
import { defaultSettings, loadSettings, saveSettings } from '../src/config/settings.js';
import { settingsPath } from '../src/config/paths.js';
import { markSetupComplete } from '../src/config/pin.js';

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-settings-'));
  for (const key of ['TERMI_HOME', 'TERMI_PROJECTS_DIR', 'TERMI_KEYRING']) {
    savedEnv[key] = process.env[key];
  }
  process.env.TERMI_HOME = path.join(tmpRoot, 'home');
  process.env.TERMI_PROJECTS_DIR = path.join(tmpRoot, 'projects');
  process.env.TERMI_KEYRING = 'file';
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('defaultSettings', () => {
  it('is the strictest configuration', () => {
    const d = defaultSettings();
    expect(d.safetyLevel).toBe('strict');
    expect(d.activeProvider).toBeNull();
    expect(d.configuredProviders).toEqual([]);
    expect(d.installId).toBe('');
    expect(d.ageBand).toBe('under13');
    expect(d.xaiParentAck).toBe(false);
    expect(d.localClassifier).toBe(true);
    expect(d.consentAttestedAt).toBeNull();
    expect(d.modelAlias).toBe('zippy');
    expect(d.version).toBe(1);
  });
});

describe('loadSettings / saveSettings', () => {
  it('reports first run when nothing exists', () => {
    const result = loadSettings();
    expect(result.firstRun).toBe(true);
    expect(result.tampered).toBe(false);
    expect(result.settings).toEqual(defaultSettings());
  });

  it('round-trips through HMAC sign and verify', () => {
    const saved = saveSettings({
      ...defaultSettings(),
      kidNickname: 'rocketfox',
      activeProvider: 'anthropic',
      configuredProviders: ['anthropic'],
      safetyLevel: 'standard',
    });
    const result = loadSettings();
    expect(result.tampered).toBe(false);
    expect(result.firstRun).toBe(false);
    expect(result.settings).toEqual(saved);
    expect(result.settings.kidNickname).toBe('rocketfox');
  });

  it('upgrades an older envelope: ollamaClassifier out, localClassifier on', () => {
    const old = { ...defaultSettings() } as Record<string, unknown>;
    delete old.localClassifier;
    old.ollamaClassifier = false;
    saveSettings(old as unknown as Parameters<typeof saveSettings>[0]);
    const result = loadSettings();
    expect(result.tampered).toBe(false);
    expect(result.settings.localClassifier).toBe(true);
    expect('ollamaClassifier' in result.settings).toBe(false);
  });

  it('generates an installId on first save and keeps it after', () => {
    const first = saveSettings(defaultSettings());
    expect(first.installId).toMatch(/^[0-9a-f-]{36}$/);
    const second = saveSettings(first);
    expect(second.installId).toBe(first.installId);
  });

  it('detects a tampered byte in the settings body', () => {
    saveSettings({ ...defaultSettings(), kidNickname: 'zorro' });
    const file = settingsPath();
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw).toContain('zorro');
    fs.writeFileSync(file, raw.replace('zorro', 'zorr0'));
    const result = loadSettings();
    expect(result.tampered).toBe(true);
    expect(result.firstRun).toBe(false);
    expect(result.settings).toEqual(defaultSettings());
  });

  it('detects a privilege edit even when the JSON stays valid', () => {
    saveSettings(defaultSettings());
    const file = settingsPath();
    const envelope = JSON.parse(fs.readFileSync(file, 'utf8')) as SettingsEnvelope;
    envelope.settings.safetyLevel = 'standard';
    fs.writeFileSync(file, JSON.stringify(envelope, null, 2));
    const result = loadSettings();
    expect(result.tampered).toBe(true);
    expect(result.settings.safetyLevel).toBe('strict');
  });

  it('fails closed on unparseable settings.json', () => {
    saveSettings(defaultSettings());
    fs.writeFileSync(settingsPath(), '{{{ definitely not json');
    const result = loadSettings();
    expect(result.tampered).toBe(true);
    expect(result.settings).toEqual(defaultSettings());
  });

  it('treats a missing file as tampering when the setup marker exists', () => {
    markSetupComplete();
    const result = loadSettings();
    expect(result.firstRun).toBe(false);
    expect(result.tampered).toBe(true);
    expect(result.settings).toEqual(defaultSettings());
  });

  it('treats a deleted file after a real save as tampering once setup completed', () => {
    saveSettings(defaultSettings());
    markSetupComplete();
    fs.rmSync(settingsPath());
    const result = loadSettings();
    expect(result.tampered).toBe(true);
    expect(result.firstRun).toBe(false);
  });
});
