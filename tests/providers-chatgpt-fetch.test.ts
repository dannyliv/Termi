import { describe, expect, it, vi } from 'vitest';
import { makeChatgptFetch } from '../src/providers/index.js';

interface CapturedCall {
  input: string;
  init: RequestInit | undefined;
}

function capturingFetch(): { calls: CapturedCall[]; fetchImpl: typeof fetch } {
  const calls: CapturedCall[] = [];
  const fetchImpl = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function headersOf(call: CapturedCall): Headers {
  return new Headers(call.init?.headers);
}

const responsesBodyWithDeveloper = JSON.stringify({
  model: 'gpt-5.4-mini',
  stream: true,
  input: [
    {
      type: 'message',
      role: 'developer',
      content: [{ type: 'input_text', text: 'Be safe and kind.' }],
    },
    {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'make my game faster' }],
    },
  ],
});

describe('makeChatgptFetch', () => {
  it('promotes the developer message to top-level instructions', async () => {
    const { calls, fetchImpl } = capturingFetch();
    const shim = makeChatgptFetch(() => Promise.resolve('tok-123'), fetchImpl);
    await shim('https://example.test/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: responsesBodyWithDeveloper,
    });
    expect(calls).toHaveLength(1);
    const sent = JSON.parse(String(calls[0]!.init?.body)) as {
      instructions: string;
      input: { role: string }[];
      model: string;
    };
    expect(sent.instructions).toBe('Be safe and kind.');
    expect(sent.input).toHaveLength(1);
    expect(sent.input[0]!.role).toBe('user');
    expect(sent.model).toBe('gpt-5.4-mini');
  });

  it('injects the Authorization header and keeps existing headers', async () => {
    const { calls, fetchImpl } = capturingFetch();
    const shim = makeChatgptFetch(() => Promise.resolve('tok-123'), fetchImpl);
    await shim('https://example.test/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'chatgpt-account-id': 'acct-9' },
      body: responsesBodyWithDeveloper,
    });
    const headers = headersOf(calls[0]!);
    expect(headers.get('authorization')).toBe('Bearer tok-123');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('chatgpt-account-id')).toBe('acct-9');
  });

  it('also promotes a system role message with string content', async () => {
    const { calls, fetchImpl } = capturingFetch();
    const shim = makeChatgptFetch(() => Promise.resolve('t'), fetchImpl);
    const body = JSON.stringify({
      model: 'm',
      input: [{ type: 'message', role: 'system', content: 'rules here' }],
    });
    await shim('https://example.test/responses', { method: 'POST', body });
    const sent = JSON.parse(String(calls[0]!.init?.body)) as {
      instructions: string;
      input: unknown[];
    };
    expect(sent.instructions).toBe('rules here');
    expect(sent.input).toHaveLength(0);
  });

  it('leaves a body without a system message unchanged', async () => {
    const { calls, fetchImpl } = capturingFetch();
    const shim = makeChatgptFetch(() => Promise.resolve('t'), fetchImpl);
    const body = JSON.stringify({
      model: 'm',
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
    });
    await shim('https://example.test/responses', { method: 'POST', body });
    expect(calls[0]!.init?.body).toBe(body);
    expect(headersOf(calls[0]!).get('authorization')).toBe('Bearer t');
  });

  it('leaves a body with existing instructions unchanged', async () => {
    const { calls, fetchImpl } = capturingFetch();
    const shim = makeChatgptFetch(() => Promise.resolve('t'), fetchImpl);
    const body = JSON.stringify({
      model: 'm',
      instructions: 'already set',
      input: [{ type: 'message', role: 'developer', content: 'should stay' }],
    });
    await shim('https://example.test/responses', { method: 'POST', body });
    expect(calls[0]!.init?.body).toBe(body);
  });

  it('leaves non-JSON string bodies untouched but still authorizes', async () => {
    const { calls, fetchImpl } = capturingFetch();
    const shim = makeChatgptFetch(() => Promise.resolve('t'), fetchImpl);
    await shim('https://example.test/responses', { method: 'POST', body: 'plain text payload' });
    expect(calls[0]!.init?.body).toBe('plain text payload');
    expect(headersOf(calls[0]!).get('authorization')).toBe('Bearer t');
  });

  it('leaves non-string bodies untouched', async () => {
    const { calls, fetchImpl } = capturingFetch();
    const shim = makeChatgptFetch(() => Promise.resolve('t'), fetchImpl);
    const bytes = new Uint8Array([1, 2, 3]);
    await shim('https://example.test/responses', { method: 'POST', body: bytes });
    expect(calls[0]!.init?.body).toBe(bytes);
  });

  it('fetches a token per request', async () => {
    const { fetchImpl } = capturingFetch();
    const getToken = vi.fn(() => Promise.resolve('t'));
    const shim = makeChatgptFetch(getToken, fetchImpl);
    await shim('https://example.test/a', { method: 'POST', body: '{}' });
    await shim('https://example.test/b', { method: 'POST', body: '{}' });
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('propagates token failures without calling the backend', async () => {
    const { calls, fetchImpl } = capturingFetch();
    const shim = makeChatgptFetch(() => Promise.reject(new Error('dead')), fetchImpl);
    await expect(shim('https://example.test/responses', { method: 'POST' })).rejects.toThrow(
      'dead',
    );
    expect(calls).toHaveLength(0);
  });
});
