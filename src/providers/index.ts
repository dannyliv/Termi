/**
 * Provider client factory. One place that knows how to talk to each
 * AI helper account: the ChatGPT sign-in backend, the OpenAI platform
 * API, Anthropic, and xAI. Secrets come from the keychain (API keys)
 * or from tokens.ts (the ChatGPT sign-in). fetch is injectable so the
 * tests never touch the network.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { getSecret } from '../auth/keychain.js';
import { PROTOCOL_ORIGINATOR, type FetchLike } from '../auth/oauth.js';
import { getValidAccessToken, loadTokens } from '../auth/tokens.js';
import type { ModelAlias, ProviderClient, ProviderId, Settings } from '../types.js';
import { resolveModelId } from './models.js';

/** Base URL of the ChatGPT coding backend (Responses wire shape, SSE). */
export const CHATGPT_BACKEND_BASE_URL = 'https://chatgpt.com/backend-api/codex';

export type { FetchLike } from '../auth/oauth.js';

export interface ProviderDeps {
  /** Injectable fetch for tests. Defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Injectable secret reader. Defaults to the keychain. */
  readSecret?: (account: string) => string | null;
  /** Injectable access token source for the ChatGPT path. */
  getAccessToken?: () => Promise<string>;
}

function isSystemLikeMessage(item: unknown): boolean {
  if (item === null || typeof item !== 'object') {
    return false;
  }
  const role = (item as { role?: unknown }).role;
  return role === 'developer' || role === 'system';
}

function messageText(item: unknown): string | null {
  if (item === null || typeof item !== 'object') {
    return null;
  }
  const content = (item as { content?: unknown }).content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (part !== null && typeof part === 'object') {
        const text = (part as { text?: unknown }).text;
        if (typeof text === 'string') {
          parts.push(text);
        }
      }
    }
    if (parts.length > 0) {
      return parts.join('\n');
    }
  }
  return null;
}

/**
 * The one load-bearing body shim for the ChatGPT backend: it requires the
 * system prompt as a top-level "instructions" string. The AI SDK emits it
 * as a developer message inside input[]. Promote it and drop the message.
 * Returns null when the body needs no change.
 */
function promoteInstructions(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if ('instructions' in obj && obj.instructions !== null && obj.instructions !== undefined) {
    return null;
  }
  const input = obj.input;
  if (!Array.isArray(input)) {
    return null;
  }
  const index = input.findIndex((item) => isSystemLikeMessage(item));
  if (index < 0) {
    return null;
  }
  const text = messageText(input[index]);
  if (text === null) {
    return null;
  }
  obj.instructions = text;
  obj.input = [...input.slice(0, index), ...input.slice(index + 1)];
  return JSON.stringify(obj);
}

/**
 * Wraps fetch for the ChatGPT backend: fetches a fresh access token and
 * injects the Authorization header per request, applies the instructions
 * promotion shim to JSON bodies, and passes everything else through.
 */
export function makeChatgptFetch(
  getToken: () => Promise<string>,
  baseFetch: FetchLike = globalThis.fetch,
): FetchLike {
  const wrapped = async (
    input: Parameters<FetchLike>[0],
    init?: Parameters<FetchLike>[1],
  ): Promise<Response> => {
    const token = await getToken();
    const nextInit: RequestInit = { ...(init ?? {}) };
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${token}`);
    nextInit.headers = headers;
    const body = init?.body;
    if (typeof body === 'string') {
      const shimmed = promoteInstructions(body);
      if (shimmed !== null) {
        nextInit.body = shimmed;
      }
    }
    return baseFetch(input, nextInit);
  };
  return wrapped as FetchLike;
}

/**
 * The free moderation endpoint needs an OpenAI platform key: either the
 * parent-supplied one in the keychain or a key minted at sign-in.
 */
export function moderationKeyAccessor(
  readSecret: (account: string) => string | null = getSecret,
): string | null {
  const key = readSecret('api-key-openai-api');
  if (key !== null && key.trim().length > 0) {
    return key;
  }
  const minted = loadTokens()?.minted_api_key;
  return minted !== undefined && minted.length > 0 ? minted : null;
}

/** Builds the client for one provider. Throws when it is not set up yet. */
export function createProviderClient(
  providerId: ProviderId,
  deps: ProviderDeps = {},
): ProviderClient {
  const readSecret = deps.readSecret ?? getSecret;
  const fetchImpl = deps.fetchImpl;
  const moderationEndpoint = moderationKeyAccessor(readSecret) !== null;

  switch (providerId) {
    case 'openai-chatgpt': {
      const stored = loadTokens();
      if (stored === null) {
        throw new Error('provider-not-configured:openai-chatgpt');
      }
      const getToken =
        deps.getAccessToken ?? ((): Promise<string> => getValidAccessToken(fetchImpl));
      const shimFetch = makeChatgptFetch(getToken, fetchImpl ?? globalThis.fetch);
      const provider = createOpenAI({
        baseURL: CHATGPT_BACKEND_BASE_URL,
        apiKey: 'unused',
        headers: {
          'chatgpt-account-id': stored.account_id,
          'OpenAI-Beta': 'responses=experimental',
          originator: PROTOCOL_ORIGINATOR,
          accept: 'text/event-stream',
        },
        fetch: shimFetch,
      });
      return {
        id: providerId,
        languageModel: (role: 'main' | 'classifier', alias: ModelAlias): unknown =>
          provider.responses(resolveModelId(providerId, role, alias)),
        moderationEndpoint,
      };
    }
    case 'openai-api': {
      const key = readSecret('api-key-openai-api') ?? loadTokens()?.minted_api_key ?? null;
      if (key === null || key.length === 0) {
        throw new Error('provider-not-configured:openai-api');
      }
      const provider = createOpenAI({
        apiKey: key,
        ...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
      });
      return {
        id: providerId,
        languageModel: (role: 'main' | 'classifier', alias: ModelAlias): unknown =>
          provider.responses(resolveModelId(providerId, role, alias)),
        moderationEndpoint,
      };
    }
    case 'anthropic': {
      const key = readSecret('api-key-anthropic');
      if (key === null || key.length === 0) {
        throw new Error('provider-not-configured:anthropic');
      }
      const provider = createAnthropic({
        apiKey: key,
        ...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
      });
      return {
        id: providerId,
        languageModel: (role: 'main' | 'classifier', alias: ModelAlias): unknown =>
          provider(resolveModelId(providerId, role, alias)),
        moderationEndpoint,
      };
    }
    case 'xai': {
      const key = readSecret('api-key-xai');
      if (key === null || key.length === 0) {
        throw new Error('provider-not-configured:xai');
      }
      const provider = createXai({
        apiKey: key,
        ...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
      });
      return {
        id: providerId,
        languageModel: (role: 'main' | 'classifier', alias: ModelAlias): unknown =>
          provider(resolveModelId(providerId, role, alias)),
        moderationEndpoint,
      };
    }
  }
}

/** Which providers have working credentials right now. */
export type ClassifierAvailability = Record<ProviderId, boolean>;

export interface ClassifierBackend {
  /** Key for the free moderation endpoint, when one exists. */
  moderationKey: string | null;
  /** Client whose classifier model runs the prompted safety checks. */
  classifierClient: ProviderClient | null;
}

function safeCreate(providerId: ProviderId, deps: ProviderDeps): ProviderClient | null {
  try {
    return createProviderClient(providerId, deps);
  } catch {
    return null;
  }
}

/**
 * Picks the safety classifier backend, independent of the active main
 * provider. Preference order: OpenAI moderation (any platform key,
 * including a minted one), then Anthropic haiku, then the ChatGPT mini
 * on quota, then xAI as the last resort.
 */
export function pickClassifierBackend(
  settings: Settings,
  availability: ClassifierAvailability,
  deps: ProviderDeps = {},
): ClassifierBackend {
  void settings; // Reserved for future toggles (for example a local classifier).
  const readSecret = deps.readSecret ?? getSecret;
  const moderationKey = moderationKeyAccessor(readSecret);
  if (moderationKey !== null) {
    return { moderationKey, classifierClient: safeCreate('openai-api', deps) };
  }
  if (availability.anthropic) {
    const client = safeCreate('anthropic', deps);
    if (client !== null) {
      return { moderationKey: null, classifierClient: client };
    }
  }
  if (availability['openai-chatgpt']) {
    const client = safeCreate('openai-chatgpt', deps);
    if (client !== null) {
      return { moderationKey: null, classifierClient: client };
    }
  }
  if (availability.xai) {
    const client = safeCreate('xai', deps);
    if (client !== null) {
      return { moderationKey: null, classifierClient: client };
    }
  }
  return { moderationKey: null, classifierClient: null };
}
