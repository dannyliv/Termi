import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setSecret } from '../src/auth/keychain.js';
import { saveTokens, type StoredTokens } from '../src/auth/tokens.js';
import {
  createProviderClient,
  moderationKeyAccessor,
  pickClassifierBackend,
  type ClassifierAvailability,
} from '../src/providers/index.js';
import type { Settings } from '../src/types.js';

const settings: Settings = {
  version: 1,
  installId: 'test-install',
  kidNickname: 'rocket',
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

const noAvailability: ClassifierAvailability = {
  'openai-chatgpt': false,
  'openai-api': false,
  anthropic: false,
  xai: false,
};

function chatgptTokens(overrides: Partial<StoredTokens> = {}): StoredTokens {
  const now = Date.now();
  return {
    provider: 'openai-chatgpt',
    access_token: 'access-x',
    refresh_token: 'refresh-x',
    id_token: '',
    account_id: 'acct-x',
    plan_type: 'free',
    issued_at: now,
    expires_at: now + 1_000_000,
    ...overrides,
  };
}

function modelIdOf(model: unknown): string {
  return (model as { modelId: string }).modelId;
}

let tmpRoot: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'termi-clients-'));
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

describe('createProviderClient', () => {
  it('builds an anthropic client with role-aware models', () => {
    setSecret('api-key-anthropic', 'sk-ant-test');
    const client = createProviderClient('anthropic');
    expect(client.id).toBe('anthropic');
    expect(client.moderationEndpoint).toBe(false);
    expect(modelIdOf(client.languageModel('main', 'zippy'))).toBe('claude-sonnet-4-6');
    expect(modelIdOf(client.languageModel('main', 'smart'))).toBe('claude-opus-4-8');
    expect(modelIdOf(client.languageModel('classifier', 'smart'))).toBe('claude-haiku-4-5');
  });

  it('builds an openai-api client and reports the moderation endpoint', () => {
    setSecret('api-key-openai-api', 'sk-test');
    const client = createProviderClient('openai-api');
    expect(client.moderationEndpoint).toBe(true);
    expect(modelIdOf(client.languageModel('main', 'zippy'))).toBe('gpt-5.4-mini');
    expect(modelIdOf(client.languageModel('classifier', 'smart'))).toBe('gpt-5.4-mini');
  });

  it('builds a chatgpt client from stored tokens', () => {
    saveTokens(chatgptTokens());
    const client = createProviderClient('openai-chatgpt');
    expect(client.id).toBe('openai-chatgpt');
    expect(client.moderationEndpoint).toBe(false);
    expect(modelIdOf(client.languageModel('main', 'smart'))).toBe('gpt-5.5');
  });

  it('chatgpt client reports moderation when a minted key exists', () => {
    saveTokens(chatgptTokens({ minted_api_key: 'sk-minted' }));
    const client = createProviderClient('openai-chatgpt');
    expect(client.moderationEndpoint).toBe(true);
  });

  it('builds an xai client', () => {
    setSecret('api-key-xai', 'xai-test');
    const client = createProviderClient('xai');
    expect(modelIdOf(client.languageModel('main', 'zippy'))).toBe('grok-4.3');
  });

  it('throws when a provider is not configured', () => {
    expect(() => createProviderClient('anthropic')).toThrow('provider-not-configured:anthropic');
    expect(() => createProviderClient('openai-api')).toThrow('provider-not-configured:openai-api');
    expect(() => createProviderClient('openai-chatgpt')).toThrow(
      'provider-not-configured:openai-chatgpt',
    );
  });
});

describe('moderationKeyAccessor', () => {
  it('prefers the keychain key', () => {
    setSecret('api-key-openai-api', 'sk-real');
    saveTokens(chatgptTokens({ minted_api_key: 'sk-minted' }));
    expect(moderationKeyAccessor()).toBe('sk-real');
  });

  it('falls back to the minted key from auth.json', () => {
    saveTokens(chatgptTokens({ minted_api_key: 'sk-minted' }));
    expect(moderationKeyAccessor()).toBe('sk-minted');
  });

  it('returns null when neither exists', () => {
    expect(moderationKeyAccessor()).toBeNull();
  });
});

describe('pickClassifierBackend preference order', () => {
  it('picks OpenAI moderation plus mini when a platform key exists', () => {
    setSecret('api-key-openai-api', 'sk-real');
    setSecret('api-key-anthropic', 'sk-ant');
    const picked = pickClassifierBackend(settings, {
      ...noAvailability,
      'openai-api': true,
      anthropic: true,
    });
    expect(picked.moderationKey).toBe('sk-real');
    expect(picked.classifierClient?.id).toBe('openai-api');
  });

  it('uses a minted key for moderation even without a keychain key', () => {
    saveTokens(chatgptTokens({ minted_api_key: 'sk-minted' }));
    const picked = pickClassifierBackend(settings, {
      ...noAvailability,
      'openai-chatgpt': true,
    });
    expect(picked.moderationKey).toBe('sk-minted');
    expect(picked.classifierClient?.id).toBe('openai-api');
    expect(modelIdOf(picked.classifierClient!.languageModel('classifier', 'zippy'))).toBe(
      'gpt-5.4-mini',
    );
  });

  it('falls back to anthropic haiku next', () => {
    setSecret('api-key-anthropic', 'sk-ant');
    const picked = pickClassifierBackend(settings, { ...noAvailability, anthropic: true });
    expect(picked.moderationKey).toBeNull();
    expect(picked.classifierClient?.id).toBe('anthropic');
    expect(modelIdOf(picked.classifierClient!.languageModel('classifier', 'zippy'))).toBe(
      'claude-haiku-4-5',
    );
  });

  it('falls back to the ChatGPT mini on quota next', () => {
    saveTokens(chatgptTokens());
    const picked = pickClassifierBackend(settings, {
      ...noAvailability,
      'openai-chatgpt': true,
      xai: true,
    });
    expect(picked.moderationKey).toBeNull();
    expect(picked.classifierClient?.id).toBe('openai-chatgpt');
  });

  it('uses xai only as the last resort', () => {
    setSecret('api-key-xai', 'xai-key');
    const picked = pickClassifierBackend(settings, { ...noAvailability, xai: true });
    expect(picked.moderationKey).toBeNull();
    expect(picked.classifierClient?.id).toBe('xai');
  });

  it('returns nulls when nothing is available', () => {
    const picked = pickClassifierBackend(settings, noAvailability);
    expect(picked.moderationKey).toBeNull();
    expect(picked.classifierClient).toBeNull();
  });

  it('ignores availability flags whose credentials are gone', () => {
    // anthropic flagged available but no key stored: skip to xai.
    setSecret('api-key-xai', 'xai-key');
    const picked = pickClassifierBackend(settings, {
      ...noAvailability,
      anthropic: true,
      xai: true,
    });
    expect(picked.classifierClient?.id).toBe('xai');
  });
});
