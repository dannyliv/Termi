import { describe, expect, it } from 'vitest';
import { hashedSafetyIdentifier, makeSafetyIdFetch } from '../src/providers/index.js';

function captureFetch(): { calls: { body: unknown }[]; fetch: typeof fetch } {
  const calls: { body: unknown }[] = [];
  const fake = async (_input: unknown, init?: RequestInit): Promise<Response> => {
    calls.push({ body: init?.body });
    return new Response('{}', { status: 200 });
  };
  return { calls, fetch: fake as typeof fetch };
}

describe('hashedSafetyIdentifier', () => {
  it('is stable, hex, and never contains the raw id', () => {
    const id = 'b0e0d8a4-1111-2222-3333-444455556666';
    const a = hashedSafetyIdentifier(id);
    expect(a).toBe(hashedSafetyIdentifier(id));
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(a).not.toContain(id);
  });
});

describe('makeSafetyIdFetch', () => {
  it('injects safety_identifier into JSON object bodies', async () => {
    const { calls, fetch: base } = captureFetch();
    const wrapped = makeSafetyIdFetch(() => 'install-1', base);
    await wrapped('https://example.test/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', input: [] }),
    });
    const sent = JSON.parse(calls[0]?.body as string) as Record<string, unknown>;
    expect(sent.safety_identifier).toBe(hashedSafetyIdentifier('install-1'));
    expect(sent.model).toBe('m');
  });

  it('keeps an existing safety_identifier and non-JSON bodies untouched', async () => {
    const { calls, fetch: base } = captureFetch();
    const wrapped = makeSafetyIdFetch(() => 'install-1', base);
    const body = JSON.stringify({ safety_identifier: 'keep-me' });
    await wrapped('https://example.test/v1/responses', { method: 'POST', body });
    expect(calls[0]?.body).toBe(body);
    await wrapped('https://example.test/v1/responses', { method: 'POST', body: 'not json' });
    expect(calls[1]?.body).toBe('not json');
  });

  it('passes through unchanged when no install id exists', async () => {
    const { calls, fetch: base } = captureFetch();
    const wrapped = makeSafetyIdFetch(() => null, base);
    const body = JSON.stringify({ model: 'm' });
    await wrapped('https://example.test/v1/responses', { method: 'POST', body });
    expect(calls[0]?.body).toBe(body);
  });
});
