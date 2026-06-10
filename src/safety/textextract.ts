/**
 * L4b: pulls the human-visible text out of project files so the output
 * classifier can judge what a kid would actually read on screen.
 *
 * HTML: text nodes plus title, alt, and aria-label attribute values.
 * JS: string literals (single, double, template) plus comments.
 * Markdown and plain text: the prose as-is.
 * CSS: the values of content: properties.
 */

import path from 'node:path';

/** Output cap in characters. Past this we truncate with a note. */
export const EXTRACT_CHAR_CAP = 6000;
export const TRUNCATION_NOTE = '[text truncated for review]';

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'");
}

function extractFromHtml(content: string): string[] {
  const pieces: string[] = [];

  // Attribute values a kid can see or hear: tooltips, image text, labels.
  const attrRe = /\b(?:title|alt|aria-label)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRe.exec(content)) !== null) {
    const value = attrMatch[2] ?? attrMatch[3] ?? '';
    if (value.trim()) {
      pieces.push(decodeEntities(value.trim()));
    }
  }

  // Drop script and style bodies, then comments, then all tags.
  let stripped = content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '\n')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, '\n');
  stripped = stripped.replace(/<[^>]+>/g, '\n');
  for (const line of stripped.split('\n')) {
    const trimmed = decodeEntities(line).trim();
    if (trimmed) {
      pieces.push(trimmed);
    }
  }
  return pieces;
}

/**
 * A small scanner over JS source. Collects string literal contents and
 * comment text. Template literals keep their text parts; ${...} expressions
 * are skipped. Not a full parser, but robust for kid-project code.
 */
function extractFromJs(content: string): string[] {
  const pieces: string[] = [];
  const push = (s: string): void => {
    const trimmed = s.trim();
    if (trimmed) {
      pieces.push(trimmed);
    }
  };

  let i = 0;
  const n = content.length;
  while (i < n) {
    const ch = content[i];
    const next = i + 1 < n ? content[i + 1] : '';

    if (ch === '/' && next === '/') {
      const end = content.indexOf('\n', i + 2);
      const stop = end === -1 ? n : end;
      push(content.slice(i + 2, stop));
      i = stop;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = content.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end;
      push(content.slice(i + 2, stop).replace(/^\s*\*+/gm, ' '));
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let buf = '';
      while (j < n) {
        const c = content[j];
        if (c === '\\' && j + 1 < n) {
          buf += content[j + 1];
          j += 2;
          continue;
        }
        if (c === quote || c === '\n') {
          break;
        }
        buf += c;
        j++;
      }
      push(buf);
      i = j + 1;
      continue;
    }
    if (ch === '`') {
      let j = i + 1;
      let buf = '';
      while (j < n) {
        const c = content[j];
        if (c === '\\' && j + 1 < n) {
          buf += content[j + 1];
          j += 2;
          continue;
        }
        if (c === '$' && j + 1 < n && content[j + 1] === '{') {
          // Skip the interpolation expression, tracking nested braces.
          let depth = 1;
          let k = j + 2;
          while (k < n && depth > 0) {
            if (content[k] === '{') depth++;
            else if (content[k] === '}') depth--;
            k++;
          }
          buf += ' ';
          j = k;
          continue;
        }
        if (c === '`') {
          break;
        }
        buf += c;
        j++;
      }
      push(buf);
      i = j + 1;
      continue;
    }
    i++;
  }
  return pieces;
}

function extractFromCss(content: string): string[] {
  const pieces: string[] = [];
  const re = /\bcontent\s*:\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const value = (match[1] ?? match[2] ?? '').trim();
    if (value) {
      pieces.push(value);
    }
  }
  return pieces;
}

/**
 * Extracts the kid-visible text from a project file. Lines are deduplicated
 * and the result is capped at 6,000 characters with a truncation note.
 */
export function extractVisibleText(relPath: string, content: string): string {
  const ext = path.extname(relPath).toLowerCase();
  let pieces: string[];
  switch (ext) {
    case '.html':
    case '.htm':
      pieces = extractFromHtml(content);
      break;
    case '.js':
    case '.mjs':
    case '.cjs':
      pieces = extractFromJs(content);
      break;
    case '.css':
      pieces = extractFromCss(content);
      break;
    case '.md':
    case '.txt':
    default:
      // Prose and unknown files: classify everything.
      pieces = content.split('\n').map((l) => l.trim());
      break;
  }

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const piece of pieces) {
    if (piece && !seen.has(piece)) {
      seen.add(piece);
      lines.push(piece);
    }
  }
  let joined = lines.join('\n');
  if (joined.length > EXTRACT_CHAR_CAP) {
    joined = `${joined.slice(0, EXTRACT_CHAR_CAP)}\n${TRUNCATION_NOTE}`;
  }
  return joined;
}
