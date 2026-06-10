/**
 * The single home for model ids. Everything else uses aliases.
 * "zippy" is the fast default, "smart" is the careful one, and
 * "classifier" is the model the safety checks call when prompted.
 */

import type { ModelAlias, ProviderId } from '../types.js';

export interface ProviderModelSet {
  zippy: string;
  smart: string;
  classifier: string;
}

export const MODELS: Record<ProviderId, ProviderModelSet> = {
  'openai-chatgpt': {
    zippy: 'gpt-5.4-mini',
    smart: 'gpt-5.5',
    classifier: 'gpt-5.4-mini',
  },
  'openai-api': {
    zippy: 'gpt-5.4-mini',
    smart: 'gpt-5.5',
    classifier: 'gpt-5.4-mini',
  },
  anthropic: {
    zippy: 'claude-sonnet-4-6',
    smart: 'claude-opus-4-8',
    classifier: 'claude-haiku-4-5',
  },
  xai: {
    zippy: 'grok-4.3',
    smart: 'grok-4.3',
    classifier: 'grok-4.3',
  },
};

/** The free dedicated moderation model on the OpenAI platform API. */
export const MODERATION_MODEL_ID = 'omni-moderation-latest';

/** Kid copy for the model picker. */
export function modelLabel(alias: ModelAlias): string {
  return alias === 'zippy' ? 'Zippy' : 'Extra smart';
}

/** Resolves an alias to the concrete model id for a provider and role. */
export function resolveModelId(
  providerId: ProviderId,
  role: 'main' | 'classifier',
  alias: ModelAlias,
): string {
  const set = MODELS[providerId];
  return role === 'classifier' ? set.classifier : set[alias];
}
