/**
 * Termi preview server.
 *
 * Serves a kid's project folder over plain HTTP on 127.0.0.1 only.
 * Adds live reload through a small server-sent-events channel.
 * Security posture:
 *   - bound strictly to the loopback address
 *   - strict Content-Security-Policy on every response (primary egress control)
 *   - path traversal guard with win32 case folding
 *   - dotfiles and TERMI.md are never served
 *   - no directory listings, no caching, no sniffing
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import open from 'open';
import type { PreviewHandle } from '../types.js';
import { previewBasePort } from '../config/paths.js';

const PORT_SCAN_RANGE = 50;
const SSE_PATH = '/__termi/reload';
const SSE_SCRIPT_PATH = '/__termi/reload.js';
const HEARTBEAT_MS = 25_000;
const DEBOUNCE_MS = 100;

/** Exact policy from the safety plan. CSP is the sound egress control. */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; media-src 'self' data:; connect-src 'self'; " +
  "frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'";

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
};
const DEFAULT_MIME = 'application/octet-stream';

/**
 * Loaded by the tag injected into every HTML page.
 * Kept as a same-origin file so the CSP (script-src 'self') allows it.
 */
const RELOAD_CLIENT_JS = [
  '(function () {',
  "  var source = new EventSource('" + SSE_PATH + "');",
  '  source.onmessage = function () { location.reload(); };',
  '})();',
].join('\n');

const RELOAD_SCRIPT_TAG = '<script src="' + SSE_SCRIPT_PATH + '"></script>';

/**
 * Served when a project has no favicon of its own. Browsers request
 * /favicon.ico on every load; without this the console shows a 404
 * error on every project. A tiny robot face keeps it friendly.
 */
const FALLBACK_FAVICON_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">',
  '<rect x="2" y="3" width="12" height="10" rx="2" fill="#7fd4ff"/>',
  '<rect x="4.5" y="6" width="2.5" height="2.5" rx="0.5" fill="#101326"/>',
  '<rect x="9" y="6" width="2.5" height="2.5" rx="0.5" fill="#101326"/>',
  '<rect x="5" y="10" width="6" height="1.5" rx="0.75" fill="#101326"/>',
  '<rect x="7.25" y="1" width="1.5" height="2" fill="#7fd4ff"/>',
  '</svg>',
].join('');

/** Friendly 404 page. No outside files. A tiny text robot keeps it warm. */
const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found</title>
<style>
  body { background: #101326; color: #e8e9f5; font-family: system-ui, sans-serif;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; text-align: center; }
  .card { padding: 2rem 2.5rem; }
  pre { color: #7fd4ff; font-size: 1.1rem; line-height: 1.25; margin: 0 0 1rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
  p { margin: 0.3rem 0; color: #b9bdd8; }
  a { color: #7fd4ff; }
</style>
</head>
<body>
<div class="card">
<pre>
   ___
  [o_o]
 /|===|\\
  |___|
  d   b
</pre>
<h1>Termi looked everywhere.</h1>
<p>This page is not in your project.</p>
<p>Check the file name. Then try again.</p>
<p><a href="/">Go back to your project</a></p>
</div>
</body>
</html>
`;

export interface PreviewOptions {
  port?: number;
  openBrowser?: boolean;
}

/** Case folds a path on Windows so jail checks ignore letter case. */
function foldCase(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

/** True when target is projectRoot itself or lives inside it. */
function isInsideRoot(projectRoot: string, target: string): boolean {
  const rootCmp = foldCase(projectRoot);
  const targetCmp = foldCase(target);
  if (targetCmp === rootCmp) return true;
  const rootWithSep = rootCmp.endsWith(path.sep) ? rootCmp : rootCmp + path.sep;
  return targetCmp.startsWith(rootWithSep);
}

/**
 * Resolves a decoded URL path against the project root.
 * Returns null when the result escapes the root, names a dotfile,
 * or names TERMI.md.
 */
function resolveSafe(projectRoot: string, decodedPath: string): string | null {
  if (decodedPath.includes('\0')) return null;
  // Treat backslashes as separators too, then drop leading separators
  // so absolute-looking requests stay relative to the root.
  const rel = decodedPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const target = path.resolve(projectRoot, rel);
  if (!isInsideRoot(projectRoot, target)) return null;

  const relFromRoot = path.relative(projectRoot, target);
  if (relFromRoot.length > 0) {
    for (const segment of relFromRoot.split(path.sep)) {
      if (segment.startsWith('.')) return null;
      if (segment.toLowerCase() === 'termi.md') return null;
    }
  }
  return target;
}

function baseHeaders(contentType: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
  };
}

function sendText(
  res: http.ServerResponse,
  status: number,
  contentType: string,
  body: string,
  headOnly: boolean,
): void {
  const buf = Buffer.from(body, 'utf-8');
  res.writeHead(status, {
    ...baseHeaders(contentType),
    'Content-Length': String(buf.byteLength),
  });
  res.end(headOnly ? undefined : buf);
}

function sendNotFound(res: http.ServerResponse, headOnly: boolean): void {
  sendText(res, 404, MIME['html'] ?? DEFAULT_MIME, NOT_FOUND_HTML, headOnly);
}

/** Injects the reload script tag right before the closing body tag. */
export function injectReloadScript(html: string): string {
  const match = /<\/body>/i.exec(html);
  if (!match) return html + '\n' + RELOAD_SCRIPT_TAG + '\n';
  const at = match.index;
  return html.slice(0, at) + RELOAD_SCRIPT_TAG + '\n' + html.slice(at);
}

function listenOnce(server: http.Server, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      server.removeListener('listening', onListening);
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(false);
      } else {
        reject(err);
      }
    };
    const onListening = (): void => {
      server.removeListener('error', onError);
      resolve(true);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host: '127.0.0.1', port, exclusive: true });
  });
}

export async function startPreview(
  projectDir: string,
  opts?: PreviewOptions,
): Promise<PreviewHandle> {
  const projectRoot = path.resolve(projectDir);
  const sseClients = new Set<http.ServerResponse>();
  let stopped = false;
  let debounceTimer: NodeJS.Timeout | null = null;

  const broadcast = (): void => {
    for (const client of sseClients) {
      try {
        client.write('data: reload\n\n');
      } catch {
        sseClients.delete(client);
      }
    }
  };

  const notifyChange = (): void => {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      broadcast();
    }, DEBOUNCE_MS);
  };

  const handleSse = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    res.writeHead(200, {
      ...baseHeaders('text/event-stream'),
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
  };

  const serveFile = async (
    res: http.ServerResponse,
    filePath: string,
    headOnly: boolean,
  ): Promise<void> => {
    let target = filePath;
    let stats: fs.Stats;
    try {
      stats = await fsp.stat(target);
    } catch {
      sendNotFound(res, headOnly);
      return;
    }
    if (stats.isDirectory()) {
      // Directories serve their index.html only. Never a listing.
      target = path.join(target, 'index.html');
      try {
        stats = await fsp.stat(target);
      } catch {
        sendNotFound(res, headOnly);
        return;
      }
      if (stats.isDirectory()) {
        sendNotFound(res, headOnly);
        return;
      }
    }

    const ext = path.extname(target).slice(1).toLowerCase();
    const mime = MIME[ext] ?? DEFAULT_MIME;

    if (ext === 'html') {
      const html = await fsp.readFile(target, 'utf-8');
      sendText(res, 200, mime, injectReloadScript(html), headOnly);
      return;
    }

    const data = await fsp.readFile(target);
    res.writeHead(200, {
      ...baseHeaders(mime),
      'Content-Length': String(data.byteLength),
    });
    res.end(headOnly ? undefined : data);
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      const method = req.method ?? 'GET';
      const headOnly = method === 'HEAD';
      if (method !== 'GET' && method !== 'HEAD') {
        sendText(res, 405, MIME['txt'] ?? DEFAULT_MIME, 'Only GET works here.\n', false);
        return;
      }

      let pathname: string;
      try {
        pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      } catch {
        sendNotFound(res, headOnly);
        return;
      }

      if (pathname === SSE_PATH) {
        handleSse(req, res);
        return;
      }
      if (pathname === SSE_SCRIPT_PATH) {
        sendText(res, 200, MIME['js'] ?? DEFAULT_MIME, RELOAD_CLIENT_JS, headOnly);
        return;
      }

      let decoded: string;
      try {
        decoded = decodeURIComponent(pathname);
      } catch {
        sendNotFound(res, headOnly);
        return;
      }

      const target = resolveSafe(projectRoot, decoded);
      if (target === null) {
        sendNotFound(res, headOnly);
        return;
      }
      // Built-in favicon fallback so every project load stays error free.
      if (decoded === '/favicon.ico' && !fs.existsSync(target)) {
        sendText(res, 200, 'image/svg+xml', FALLBACK_FAVICON_SVG, headOnly);
        return;
      }
      await serveFile(res, target, headOnly);
    })().catch(() => {
      try {
        if (!res.headersSent) {
          sendText(
            res,
            500,
            MIME['txt'] ?? DEFAULT_MIME,
            'Something went wrong. Try again.\n',
            false,
          );
        } else {
          res.end();
        }
      } catch {
        // Socket already gone. Nothing left to do.
      }
    });
  });

  // Find a port: explicit port from opts, or base port plus an upward scan.
  let boundPort: number | null = null;
  const candidates: number[] = [];
  if (opts?.port !== undefined) {
    candidates.push(opts.port);
  } else {
    for (let i = 0; i <= PORT_SCAN_RANGE; i += 1) {
      candidates.push(previewBasePort + i);
    }
  }
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await listenOnce(server, candidate)) {
      boundPort = candidate;
      break;
    }
  }
  if (boundPort === null) {
    throw new Error(
      'No free port for the preview. Close other previews and try again.',
    );
  }

  // Heartbeat comments keep proxies from dropping quiet SSE connections.
  const heartbeat = setInterval(() => {
    for (const client of sseClients) {
      try {
        client.write(': heartbeat\n\n');
      } catch {
        sseClients.delete(client);
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  // Backup watcher only. Tool code calls notifyChange() directly after writes.
  let watcher: fs.FSWatcher | null = null;
  try {
    watcher = fs.watch(projectRoot, { recursive: true }, () => notifyChange());
    watcher.on('error', () => {
      // Recursive watch can fail on some platforms. The direct trigger covers us.
    });
  } catch {
    watcher = null;
  }

  const url = `http://127.0.0.1:${boundPort}/`;

  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    clearInterval(heartbeat);
    for (const client of sseClients) {
      try {
        client.end();
      } catch {
        // Already closed.
      }
    }
    sseClients.clear();
    if (watcher) {
      try {
        watcher.close();
      } catch {
        // Already closed.
      }
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  };

  if (opts?.openBrowser) {
    try {
      await open(url);
    } catch {
      // The preview still works. The kid can open the link by hand.
    }
  }

  return { url, port: boundPort, notifyChange, stop };
}
