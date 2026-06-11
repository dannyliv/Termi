import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  grokKeyAllowed,
  providerLabel,
  providerOptions,
  suggestProjectNames,
  validateApiKey,
} from '../src/setup/wizard.js';
import {
  auditOneLiner,
  collectAttention,
  needsAttentionLines,
  parseAuditLog,
  usageNote,
} from '../src/grownups/panel.js';
import { defaultSettings } from '../src/config/settings.js';

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-wizhelpers-'));
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

describe('providerOptions', () => {
  it('puts the ChatGPT sign-in first', () => {
    const options = providerOptions();
    expect(options[0]?.value).toBe('openai-chatgpt');
    expect(options[0]?.label).toBe('ChatGPT sign-in');
  });

  it('offers every provider plus a skip', () => {
    const values = providerOptions().map((o) => o.value);
    expect(values).toEqual(['openai-chatgpt', 'anthropic', 'openai-api', 'xai', 'skip']);
  });
});

describe('providerLabel', () => {
  it('names each provider for parents', () => {
    expect(providerLabel('openai-chatgpt')).toBe('ChatGPT sign-in');
    expect(providerLabel('anthropic')).toBe('Claude key');
    expect(providerLabel('openai-api')).toBe('OpenAI key');
    expect(providerLabel('xai')).toBe('Grok key');
  });
});

describe('grokKeyAllowed', () => {
  it('requires the explicit parent acknowledgment', () => {
    expect(grokKeyAllowed(true)).toBe(true);
    expect(grokKeyAllowed(false)).toBe(false);
  });
});

describe('suggestProjectNames', () => {
  it('returns three distinct names built from the theme', () => {
    const names = suggestProjectNames('Space Rocks', () => 0);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    for (const name of names) {
      expect(name).toContain('Space Rocks');
    }
  });

  it('is stable for a fixed random source', () => {
    expect(suggestProjectNames('Space Rocks', () => 0)).toEqual(
      suggestProjectNames('Space Rocks', () => 0),
    );
  });

  it('falls back to a core word for an empty theme', () => {
    const names = suggestProjectNames('   ', () => 0.5);
    expect(names).toHaveLength(3);
    for (const name of names) {
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('validateApiKey', () => {
  const fakeFetch = (status: number): typeof fetch =>
    (() => Promise.resolve(new Response('{}', { status }))) as typeof fetch;

  it('flags a clear 401 or 403 as bad', async () => {
    expect(await validateApiKey('anthropic', 'k', fakeFetch(401))).toBe('bad');
    expect(await validateApiKey('openai-api', 'k', fakeFetch(403))).toBe('bad');
  });

  it('accepts a 200', async () => {
    expect(await validateApiKey('xai', 'k', fakeFetch(200))).toBe('ok');
  });

  it('treats network failures as unknown, never as bad', async () => {
    const failing = (() => Promise.reject(new Error('offline'))) as typeof fetch;
    expect(await validateApiKey('anthropic', 'k', failing)).toBe('unknown');
  });
});

describe('panel: auditOneLiner', () => {
  it('summarizes a block with time, layer, and category', () => {
    const line = auditOneLiner({
      ts: '2026-06-10T17:00:00.000Z',
      layer: 'L2',
      event: 'block',
      category: 'violence',
    });
    expect(line).toContain('[L2]');
    expect(line).toContain('blocked');
    expect(line).toContain('(violence)');
  });

  it('makes grooming flags unmissable', () => {
    const line = auditOneLiner({
      ts: '2026-06-10T17:00:00.000Z',
      layer: 'L2',
      event: 'grooming_flag',
      category: 'grooming',
    });
    expect(line.startsWith('!!')).toBe(true);
    expect(line).toContain('grooming');
  });

  it('falls back to the raw event name for unknown events', () => {
    const line = auditOneLiner({ ts: 'bad-date', layer: 'system', event: 'mystery_event' });
    expect(line).toContain('mystery_event');
    expect(line).toContain('bad-date');
  });
});

describe('panel: parseAuditLog', () => {
  it('parses entries and skips anchors and junk', () => {
    const raw = [
      JSON.stringify({ ts: 't1', layer: 'system', anchor: true, prevMac: 'x', mac: 'y' }),
      JSON.stringify({ ts: 't2', layer: 'L2', event: 'block', category: 'pii', prevMac: 'a', mac: 'b' }),
      'this is not json',
      JSON.stringify({ noTs: true }),
      JSON.stringify({ ts: 't3', layer: 'system', event: 'consent', prevMac: 'b', mac: 'c' }),
    ].join('\n');
    const parsed = parseAuditLog(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ ts: 't2', layer: 'L2', event: 'block', category: 'pii' });
    expect(parsed[1]).toMatchObject({ ts: 't3', event: 'consent' });
  });

  it('returns empty for an empty log', () => {
    expect(parseAuditLog('')).toEqual([]);
  });
});

describe('panel: attention and usage', () => {
  it('reports nothing when all is well', () => {
    expect(needsAttentionLines({ authDead: false, fallbackKeychain: false })).toEqual([]);
  });

  it('reports a dead sign-in and the fallback keychain', () => {
    const lines = needsAttentionLines({ authDead: true, fallbackKeychain: true });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('sign-in');
    expect(lines[1]).toContain('keychain');
  });

  it('collectAttention flags a missing ChatGPT sign-in only when it is active', () => {
    const base = defaultSettings();
    expect(collectAttention({ ...base, activeProvider: 'openai-chatgpt' }).authDead).toBe(true);
    expect(collectAttention({ ...base, activeProvider: 'anthropic' }).authDead).toBe(false);
    expect(collectAttention(base).authDead).toBe(false);
  });

  it('usageNote explains the three calls and the quota', () => {
    const free = usageNote('openai-api', true);
    expect(free).toContain('3 AI calls');
    expect(free).toContain('free checker');
    const quota = usageNote('openai-chatgpt', false);
    expect(quota).toContain('quota');
  });
});
