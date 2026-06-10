/**
 * Preview server tests. Pure node:http requests, no browser, no network
 * beyond 127.0.0.1, no real ~/.termi (TERMI_HOME and TERMI_PROJECTS_DIR
 * point at temp dirs before the module under test loads).
 */

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PreviewHandle } from '../src/types.js';

const EXPECTED_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; media-src 'self' data:; connect-src 'self'; " +
  "frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'";

type ServerModule = typeof import('../src/preview/server.js');

let serverModule: ServerModule;
let parentDir: string;
let projectDir: string;
let handle: PreviewHandle;
let port: number;
const cleanups: (() => Promise<void>)[] = [];

function randomPort(): number {
  return 20_000 + Math.floor(Math.random() * 20_000);
}

async function startOnFreePort(dir: string): Promise<PreviewHandle> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await serverModule.startPreview(dir, { port: randomPort() });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

interface SimpleResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** Raw GET so traversal paths reach the server without client rewriting. */
function httpGet(targetPort: number, rawPath: string): Promise<SimpleResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: targetPort, path: rawPath, method: 'GET' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function waitUntil(check: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  if (!check()) throw new Error('condition not met within ' + String(timeoutMs) + 'ms');
}

beforeAll(async () => {
  // Keep the module under test away from the real home directory.
  process.env['TERMI_HOME'] = await mkdtemp(path.join(os.tmpdir(), 'termi-home-'));
  process.env['TERMI_PROJECTS_DIR'] = await mkdtemp(path.join(os.tmpdir(), 'termi-projects-'));
  serverModule = await import('../src/preview/server.js');

  parentDir = await mkdtemp(path.join(os.tmpdir(), 'termi-preview-'));
  projectDir = path.join(parentDir, 'site');
  await mkdir(projectDir);
  await mkdir(path.join(projectDir, 'sub'));
  await mkdir(path.join(projectDir, 'plain'));

  await writeFile(
    path.join(parentDir, 'secret.txt'),
    'TOP SECRET outside the project',
    'utf-8',
  );
  await writeFile(
    path.join(projectDir, 'index.html'),
    '<!doctype html><html><head><title>Hi</title></head>' +
      '<body><h1>Hello Termi</h1></body></html>',
    'utf-8',
  );
  await writeFile(path.join(projectDir, 'style.css'), 'body { background: navy; }', 'utf-8');
  await writeFile(path.join(projectDir, 'app.js'), 'console.log("hi");', 'utf-8');
  await writeFile(path.join(projectDir, 'TERMI.md'), 'project notes, never served', 'utf-8');
  await writeFile(path.join(projectDir, '.hidden'), 'dotfile, never served', 'utf-8');
  await writeFile(
    path.join(projectDir, 'sub', 'index.html'),
    '<html><body><p>sub page</p></body></html>',
    'utf-8',
  );
  await writeFile(path.join(projectDir, 'plain', 'inner-file.txt'), 'listing bait', 'utf-8');

  handle = await startOnFreePort(projectDir);
  port = handle.port;
  cleanups.push(() => handle.stop());
});

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) {
    await cleanup();
  }
  await rm(parentDir, { recursive: true, force: true });
});

describe('static serving and headers', () => {
  it('serves a css file with CSP, no-store, and nosniff headers', async () => {
    const res = await httpGet(port, '/style.css');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/css');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-security-policy']).toBe(EXPECTED_CSP);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toContain('background: navy');
  });

  it('reports the bound url and port on the handle', () => {
    expect(handle.port).toBe(port);
    expect(handle.url).toBe('http://127.0.0.1:' + String(port) + '/');
  });

  it('injects the reload script into html responses only', async () => {
    const page = await httpGet(port, '/');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('Hello Termi');
    expect(page.body).toContain('<script src="/__termi/reload.js"></script>');
    const tagAt = page.body.indexOf('/__termi/reload.js');
    const bodyCloseAt = page.body.indexOf('</body>');
    expect(tagAt).toBeGreaterThan(-1);
    expect(bodyCloseAt).toBeGreaterThan(tagAt);

    const css = await httpGet(port, '/style.css');
    expect(css.body).not.toContain('__termi/reload.js');
    const js = await httpGet(port, '/app.js');
    expect(js.body).not.toContain('__termi/reload.js');
  });

  it('serves the reload client script from a same-origin path', async () => {
    const res = await httpGet(port, '/__termi/reload.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/javascript');
    expect(res.body).toContain("EventSource('/__termi/reload')");
    expect(res.body).toContain('location.reload()');
  });

  it('serves index.html for a directory request and never lists files', async () => {
    const withSlash = await httpGet(port, '/sub/');
    expect(withSlash.status).toBe(200);
    expect(withSlash.body).toContain('sub page');

    const noSlash = await httpGet(port, '/sub');
    expect(noSlash.status).toBe(200);
    expect(noSlash.body).toContain('sub page');

    const noIndex = await httpGet(port, '/plain/');
    expect(noIndex.status).toBe(404);
    expect(noIndex.body).not.toContain('inner-file.txt');
  });

  it('appends the reload script when html has no closing body tag', () => {
    const out = serverModule.injectReloadScript('<p>loose html</p>');
    expect(out).toContain('<p>loose html</p>');
    expect(out).toContain('<script src="/__termi/reload.js"></script>');
  });
});

describe('path traversal and protected files', () => {
  it('rejects plain dot-dot traversal', async () => {
    const res = await httpGet(port, '/../secret.txt');
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('TOP SECRET');
  });

  it('rejects percent-encoded traversal (%2e%2e%2f)', async () => {
    const res = await httpGet(port, '/%2e%2e%2fsecret.txt');
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('TOP SECRET');
  });

  it('rejects mixed encoded traversal (..%2f)', async () => {
    const res = await httpGet(port, '/..%2fsecret.txt');
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('TOP SECRET');
  });

  it('rejects absolute path requests', async () => {
    const secretAbs = path.join(parentDir, 'secret.txt');
    const res = await httpGet(port, '/' + encodeURIComponent(secretAbs));
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('TOP SECRET');
  });

  it('never serves TERMI.md in any letter case', async () => {
    const upper = await httpGet(port, '/TERMI.md');
    expect(upper.status).toBe(404);
    expect(upper.body).not.toContain('project notes');

    const lower = await httpGet(port, '/termi.md');
    expect(lower.status).toBe(404);
    expect(lower.body).not.toContain('project notes');
  });

  it('never serves dotfiles', async () => {
    const res = await httpGet(port, '/.hidden');
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('dotfile, never served');
  });
});

describe('friendly 404 page', () => {
  it('shows a kind page with the text robot and full headers', async () => {
    const res = await httpGet(port, '/missing-page.html');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toBe(EXPECTED_CSP);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toContain('Termi looked everywhere.');
    expect(res.body).toContain('[o_o]');
    expect(res.body).toContain('Go back to your project');
  });
});

describe('live reload over SSE', () => {
  it('delivers a reload event after notifyChange()', async () => {
    const received: string[] = [];
    const req = http.get(
      { host: '127.0.0.1', port, path: '/__termi/reload' },
      (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');
        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => received.push(chunk));
      },
    );
    req.on('error', () => {
      // Destroyed at the end of the test. Late errors are fine.
    });

    await waitUntil(() => received.join('').includes(': connected'), 3000);
    handle.notifyChange();
    await waitUntil(() => received.join('').includes('data: reload'), 3000);
    req.destroy();
  });

  it('debounces bursts into one broadcast', async () => {
    const received: string[] = [];
    const req = http.get(
      { host: '127.0.0.1', port, path: '/__termi/reload' },
      (res) => {
        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => received.push(chunk));
      },
    );
    req.on('error', () => {
      // Destroyed at the end of the test. Late errors are fine.
    });
    await waitUntil(() => received.join('').includes(': connected'), 3000);

    handle.notifyChange();
    handle.notifyChange();
    handle.notifyChange();
    await waitUntil(() => received.join('').includes('data: reload'), 3000);
    // Give a possible second broadcast time to arrive, then count.
    await new Promise((r) => setTimeout(r, 250));
    const count = received.join('').split('data: reload').length - 1;
    expect(count).toBe(1);
    req.destroy();
  });
});

describe('lifecycle', () => {
  it('stop() closes the server and open SSE clients cleanly', async () => {
    const second = await startOnFreePort(projectDir);
    const ok = await httpGet(second.port, '/');
    expect(ok.status).toBe(200);

    // Hold an SSE connection open so stop() has a client to close.
    const sseChunks: string[] = [];
    const sseReq = http.get(
      { host: '127.0.0.1', port: second.port, path: '/__termi/reload' },
      (res) => {
        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => sseChunks.push(chunk));
      },
    );
    sseReq.on('error', () => {
      // The server shuts down underneath this request. Expected.
    });
    await waitUntil(() => sseChunks.join('').includes(': connected'), 3000);

    await second.stop();
    await expect(httpGet(second.port, '/')).rejects.toThrow();
    sseReq.destroy();
  });
});
