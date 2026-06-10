/**
 * L4c: static code scan, defense in depth only. The sound egress control is
 * the preview server CSP; this scanner catches the obvious tricks early and
 * explains them in plain engineering terms the model can act on.
 *
 * Only JS, HTML, and CSS files are scanned. Markdown and plain text go
 * through text classification instead. Relative and local references pass.
 */

import path from 'node:path';
import type { CodeScanResult } from '../types.js';

type FileKind = 'js' | 'html' | 'css' | 'skip';

function fileKind(relPath: string): FileKind {
  const ext = path.extname(relPath).toLowerCase();
  switch (ext) {
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'js';
    case '.html':
    case '.htm':
      return 'html';
    case '.css':
      return 'css';
    default:
      return 'skip';
  }
}

interface ScanRule {
  /** Which kinds of file this rule applies to. */
  kinds: FileKind[];
  regex: RegExp;
  reason: string;
}

const EXTERNAL_URL = 'https?:|//';

const RULES: ScanRule[] = [
  // Network APIs. Termi projects must work with zero network.
  {
    kinds: ['js', 'html'],
    regex: /\bfetch\s*\(/,
    reason: 'uses fetch, a network call. Projects must work fully offline.',
  },
  {
    kinds: ['js', 'html'],
    regex: /\bXMLHttpRequest\b/,
    reason: 'uses XMLHttpRequest, a network call. Projects must work fully offline.',
  },
  {
    kinds: ['js', 'html'],
    regex: /\bnew\s+WebSocket\s*\(|\bWebSocket\s*\(/,
    reason: 'opens a WebSocket, a live network connection. Not allowed.',
  },
  {
    kinds: ['js', 'html'],
    regex: /\bnew\s+EventSource\s*\(|\bEventSource\s*\(/,
    reason: 'opens an EventSource, a network stream. Not allowed.',
  },
  {
    kinds: ['js', 'html'],
    regex: /\bsendBeacon\s*\(/,
    reason: 'uses sendBeacon, which sends data out. Not allowed.',
  },
  {
    kinds: ['js', 'html'],
    regex: /\bRTCPeerConnection\b/,
    reason: 'uses RTCPeerConnection, a network channel. Not allowed.',
  },
  {
    kinds: ['js', 'html'],
    regex: new RegExp(`\\.src\\s*=\\s*["'\`]\\s*(?:${EXTERNAL_URL})`),
    reason: 'sets a src to an outside web address. Use local files only.',
  },
  {
    kinds: ['js'],
    regex: new RegExp(`\\bimport\\s*\\(\\s*["'\`](?:${EXTERNAL_URL})`),
    reason: 'imports code from the internet. Import local files only.',
  },
  {
    kinds: ['js'],
    regex: new RegExp(`\\bimport\\b[^'"\`\\n]*["'\`](?:${EXTERNAL_URL})`),
    reason: 'imports code from the internet. Import local files only.',
  },
  {
    kinds: ['html'],
    regex: new RegExp(`<script[^>]+src\\s*=\\s*["']?\\s*(?:${EXTERNAL_URL})`, 'i'),
    reason: 'loads a script from the internet. Use local script files only.',
  },
  {
    kinds: ['html'],
    regex: new RegExp(`<(?:link|img|iframe|audio|video|source|embed|object)[^>]+(?:href|src|data)\\s*=\\s*["']?\\s*(?:${EXTERNAL_URL})`, 'i'),
    reason: 'loads something from an outside web address. Use local files only.',
  },
  {
    kinds: ['html'],
    regex: new RegExp(`<form[^>]+action\\s*=\\s*["']?\\s*(?:${EXTERNAL_URL})`, 'i'),
    reason: 'sends a form to an outside web address. Forms must stay local.',
  },
  {
    kinds: ['css'],
    regex: new RegExp(`url\\(\\s*["']?\\s*(?:${EXTERNAL_URL})`, 'i'),
    reason: 'loads a style resource from the internet. Use local files only.',
  },
  {
    kinds: ['css'],
    regex: new RegExp(`@import\\s+["']?\\s*(?:${EXTERNAL_URL})`, 'i'),
    reason: 'imports a stylesheet from the internet. Use local files only.',
  },

  // Eval family. Code built from strings is impossible to review.
  {
    kinds: ['js', 'html'],
    regex: /\beval\s*\(/,
    reason: 'uses eval, which runs code from a string. Write the code directly.',
  },
  {
    kinds: ['js', 'html'],
    regex: /\bnew\s+Function\s*\(/,
    reason: 'uses new Function, which runs code from a string. Write the code directly.',
  },
  {
    kinds: ['js', 'html'],
    regex: /\bset(?:Timeout|Interval)\s*\(\s*["'`]/,
    reason: 'passes a code string to a timer. Pass a function instead.',
  },

  // Storage and document tricks.
  {
    kinds: ['js', 'html'],
    regex: /\bdocument\s*\.\s*cookie\b/,
    reason: 'touches document.cookie. Use localStorage for saving game data.',
  },
  {
    kinds: ['js', 'html'],
    regex: /["'`=]\s*javascript:/i,
    reason: 'uses a javascript: link, which hides code in a URL. Not allowed.',
  },
  {
    kinds: ['js', 'html'],
    regex: /data:text\/html/i,
    reason: 'uses a data:text/html URL, which hides a page in a URL. Not allowed.',
  },
  {
    kinds: ['html'],
    regex: /\bsrcdoc\s*=/i,
    reason: 'uses iframe srcdoc, which embeds a hidden page. Not allowed.',
  },
  {
    kinds: ['html'],
    regex: /<base\b/i,
    reason: 'uses a base tag, which redirects where files load from. Not allowed.',
  },
  {
    kinds: ['html'],
    regex: /<meta[^>]+http-equiv\s*=\s*["']?refresh[^>]*url\s*=/i,
    reason: 'uses a meta refresh that jumps to another page. Not allowed.',
  },
];

/**
 * Scans one project file. Returns ok plus plain-language reasons for each
 * finding. TERMI.md and .txt files skip the scan: they are prose and go
 * through text classification.
 */
export function scanCode(relPath: string, content: string): CodeScanResult {
  const kind = fileKind(relPath);
  if (kind === 'skip') {
    return { ok: true, reasons: [] };
  }
  const reasons: string[] = [];
  for (const rule of RULES) {
    if (!rule.kinds.includes(kind)) {
      continue;
    }
    rule.regex.lastIndex = 0;
    if (rule.regex.test(content)) {
      reasons.push(`${relPath}: ${rule.reason}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}
