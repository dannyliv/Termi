/**
 * Provider client factory. One place that knows how to talk to each
 * AI helper account: the ChatGPT sign-in backend, the OpenAI platform
 * API, Anthropic, and xAI. Secrets come from the keychain (API keys)
 * or from tokens.ts (the ChatGPT sign-in). fetch is injectable so the
 * tests never touch the network.
 */

import { createHash } from 'node:crypto';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { getSecret } from '../auth/keychain.js';
import { loadSettings } from '../config/settings.js';
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
  /**
   * Install id used to derive the hashed safety identifier sent on
   * OpenAI platform API calls. Defaults to the saved settings value.
   */
  installId?: string | null;
  /**
   * Overrides the saved xaiParentAck settings flag. The xai client only
   * builds when a parent has confirmed the adults-only acknowledgment,
   * even if a key exists in the keychain.
   */
  xaiParentAck?: boolean;
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
 * Sent as instructions when a request carries no system message at all
 * (for example a prompted classifier call). The backend rejects requests
 * without a top-level instructions string.
 */
export const CHATGPT_FALLBACK_INSTRUCTIONS = 'Follow the latest user message exactly.';

/**
 * Body params the ChatGPT coding backend rejects with a 400
 * ("Unsupported parameter"). Verified live against the backend.
 */
const CHATGPT_REJECTED_PARAMS = ['max_output_tokens'] as const;

/**
 * The load-bearing body shim for the ChatGPT backend. The backend requires
 * a top-level "instructions" string and store set to false on every call.
 * The AI SDK emits the system prompt as a developer message inside input[],
 * so promote it and drop the message. Requests without any system message
 * (for example classifier calls) get a neutral fallback instruction, and
 * store defaults to false when the caller did not set it.
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
  let changed = false;
  if (obj.store === undefined || obj.store === null) {
    obj.store = false;
    changed = true;
  }
  for (const param of CHATGPT_REJECTED_PARAMS) {
    if (param in obj) {
      delete obj[param];
      changed = true;
    }
  }
  const hasInstructions =
    'instructions' in obj && obj.instructions !== null && obj.instructions !== undefined;
  const input = obj.input;
  if (!hasInstructions && Array.isArray(input)) {
    const index = input.findIndex((item) => isSystemLikeMessage(item));
    const text = index >= 0 ? messageText(input[index]) : null;
    if (index >= 0 && text !== null) {
      obj.instructions = text;
      obj.input = [...input.slice(0, index), ...input.slice(index + 1)];
    } else {
      obj.instructions = CHATGPT_FALLBACK_INSTRUCTIONS;
    }
    changed = true;
  }
  return changed ? JSON.stringify(obj) : null;
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
 * Hashes the install id into an anonymous, stable safety identifier.
 * Sent on OpenAI platform API calls so any abuse flag lands on this
 * one install instead of the whole account, per the provider's
 * guidance for products used by minors. Never reversible to the id.
 */
export function hashedSafetyIdentifier(installId: string): string {
  return createHash('sha256').update(`termi:${installId}`).digest('hex').slice(0, 40);
}

/**
 * Wraps fetch for the OpenAI platform API: injects safety_identifier
 * into JSON request bodies that do not already carry one. Bodies that
 * are not JSON objects pass through untouched.
 */
export function makeSafetyIdFetch(
  getInstallId: () => string | null,
  baseFetch: FetchLike = globalThis.fetch,
): FetchLike {
  const wrapped = async (
    input: Parameters<FetchLike>[0],
    init?: Parameters<FetchLike>[1],
  ): Promise<Response> => {
    const body = init?.body;
    const installId = getInstallId();
    if (typeof body === 'string' && installId !== null && installId.length > 0) {
      try {
        const obj: unknown = JSON.parse(body);
        if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
          const record = obj as Record<string, unknown>;
          if (!('safety_identifier' in record)) {
            record.safety_identifier = hashedSafetyIdentifier(installId);
            return baseFetch(input, { ...(init ?? {}), body: JSON.stringify(record) });
          }
        }
      } catch {
        // Not JSON: pass through unchanged.
      }
    }
    return baseFetch(input, init);
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
      // Resolved once per client, not per request: the id never changes
      // mid-session and loadSettings costs a disk read plus an HMAC check.
      let resolvedInstallId: string | null;
      if (deps.installId !== undefined) {
        resolvedInstallId = deps.installId;
      } else {
        const id = loadSettings().settings.installId;
        resolvedInstallId = id.length > 0 ? id : null;
      }
      const provider = createOpenAI({
        apiKey: key,
        fetch: makeSafetyIdFetch(() => resolvedInstallId, fetchImpl ?? globalThis.fetch),
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
      // The adults-only acknowledgment is enforced here, not only in the
      // wizard UI: a key dropped into the keychain by any other path still
      // refuses to run until a parent has confirmed.
      const ack = deps.xaiParentAck ?? loadSettings().settings.xaiParentAck;
      if (!ack) {
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

/** First prompted-classifier client that builds, in preference order. */
function promptedClassifierClient(
  availability: ClassifierAvailability,
  deps: ProviderDeps,
): ProviderClient | null {
  const order: ProviderId[] = ['anthropic', 'openai-chatgpt', 'xai'];
  for (const id of order) {
    if (availability[id]) {
      const client = safeCreate(id, deps);
      if (client !== null) {
        return client;
      }
    }
  }
  return null;
}

/**
 * Picks the safety classifier backend, independent of the active main
 * provider. Preference order: OpenAI moderation (any platform key,
 * including a minted one), then Anthropic haiku, then the ChatGPT mini
 * on quota, then xAI as the last resort. When the moderation key exists
 * but the openai-api client will not build, the prompted kid-check falls
 * through the same chain so grooming, pii, and jailbreak stay covered.
 */
export function pickClassifierBackend(
  settings: Settings,
  availability: ClassifierAvailability,
  deps: ProviderDeps = {},
): ClassifierBackend {
  // The on-device guard is not chosen here: it is wired straight into the
  // safety pipeline (localGuard dep) and runs alongside whichever cloud
  // backends this picker selects. settings stays for future cloud toggles.
  void settings;
  const readSecret = deps.readSecret ?? getSecret;
  const moderationKey = moderationKeyAccessor(readSecret);
  if (moderationKey !== null) {
    const client =
      safeCreate('openai-api', deps) ?? promptedClassifierClient(availability, deps);
    return { moderationKey, classifierClient: client };
  }
  return { moderationKey: null, classifierClient: promptedClassifierClient(availability, deps) };
}
