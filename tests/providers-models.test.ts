import { describe, expect, it } from 'vitest';
import type { ProviderId } from '../src/types.js';
import {
  MODELS,
  MODERATION_MODEL_ID,
  modelLabel,
  resolveModelId,
} from '../src/providers/models.js';

const ALL_PROVIDERS: ProviderId[] = ['openai-chatgpt', 'openai-api', 'anthropic', 'xai'];

describe('model alias map', () => {
  it('matches the plan table exactly', () => {
    expect(MODELS).toEqual({
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
    });
  });

  it('has zippy, smart, and classifier entries for every provider', () => {
    for (const id of ALL_PROVIDERS) {
      const set = MODELS[id];
      expect(set.zippy.length).toBeGreaterThan(0);
      expect(set.smart.length).toBeGreaterThan(0);
      expect(set.classifier.length).toBeGreaterThan(0);
    }
  });

  it('exposes the moderation model id', () => {
    expect(MODERATION_MODEL_ID).toBe('omni-moderation-latest');
  });
});

describe('modelLabel', () => {
  it('gives kid copy for both aliases', () => {
    expect(modelLabel('zippy')).toBe('Zippy');
    expect(modelLabel('smart')).toBe('Extra smart');
  });
});

describe('resolveModelId', () => {
  it('uses the alias for the main role', () => {
    expect(resolveModelId('anthropic', 'main', 'zippy')).toBe('claude-sonnet-4-6');
    expect(resolveModelId('anthropic', 'main', 'smart')).toBe('claude-opus-4-8');
    expect(resolveModelId('openai-chatgpt', 'main', 'smart')).toBe('gpt-5.5');
  });

  it('ignores the alias for the classifier role', () => {
    expect(resolveModelId('anthropic', 'classifier', 'smart')).toBe('claude-haiku-4-5');
    expect(resolveModelId('openai-api', 'classifier', 'smart')).toBe('gpt-5.4-mini');
    expect(resolveModelId('xai', 'classifier', 'zippy')).toBe('grok-4.3');
  });
});
