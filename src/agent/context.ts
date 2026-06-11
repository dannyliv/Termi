/**
 * Builds the model input for one turn, tuned for token efficiency:
 * - The system prompt stays out of here (the loop sends it first, stable).
 * - Only files CHANGED since the last embed go in full. Unchanged files are
 *   one line each and the model uses read_file on demand.
 * - History is plain truncation: last 30 entries and a 6,000 char budget.
 * - Every piece of untrusted text passes safety.prefilterContext and lands
 *   inside data tags the system prompt declares to be data, not instructions.
 */

import { createHash } from 'node:crypto';
import type { ModelMessage, SystemModelMessage } from 'ai';
import type { ProviderId } from '../types.js';

/** Max history entries kept (one entry per kid or termi turn). */
export const HISTORY_TURN_CAP = 30;
/** Max total characters of history text. Oldest entries drop first. */
export const HISTORY_CHAR_BUDGET = 6000;
/** Max lines of TERMI.md embedded per turn. */
export const TERMI_MD_LINE_CAP = 60;

export interface HistoryEntry {
  role: 'kid' | 'termi';
  text: string;
}

/** The slice of the project store the context builder needs. */
export interface ContextProject {
  listKidFiles(): { relPath: string; bytes: number }[];
  readFile(relPath: string): string | null;
  readTermiMd(): string;
}

/** The slice of the safety pipeline the context builder needs. */
export interface ContextSafety {
  prefilterContext(text: string): string;
}

/** Tracks the sha256 of each file as last embedded, per session. */
export type EmbedState = Map<string, string>;

export function createEmbedState(): EmbedState {
  return new Map();
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Plain truncation, newest first: keep at most HISTORY_TURN_CAP entries and
 * HISTORY_CHAR_BUDGET total characters. Pairs stay intact: an orphaned termi
 * reply whose kid message was dropped gets dropped too.
 */
export function trimHistory(history: HistoryEntry[]): HistoryEntry[] {
  const kept: HistoryEntry[] = [];
  let chars = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry === undefined) {
      continue;
    }
    if (kept.length >= HISTORY_TURN_CAP || chars + entry.text.length > HISTORY_CHAR_BUDGET) {
      break;
    }
    kept.unshift(entry);
    chars += entry.text.length;
  }
  while (kept.length > 0 && kept[0]?.role === 'termi') {
    kept.shift();
  }
  return kept;
}

/** First line that IS a comment (//, /*, or <!--), for the one-line listing. */
export function firstCommentLine(content: string): string | null {
  for (const raw of content.split('\n').slice(0, 40)) {
    const line = raw.trim();
    const m =
      /^\/\/\s*(.+)$/.exec(line) ??
      /^\/\*+\s*([^*]+?)\s*(?:\*+\/)?$/.exec(line) ??
      /^<!--\s*(.+?)\s*(?:-->)?$/.exec(line);
    const text = m?.[1]?.trim();
    if (text !== undefined && text.length > 0) {
      return text.slice(0, 60);
    }
  }
  return null;
}

function capLines(text: string, maxLines: number): string {
  const lines = text.split('\n');
  return lines.length <= maxLines ? text : lines.slice(0, maxLines).join('\n');
}

/**
 * Assembles the per-turn messages (history plus one composed user message).
 * Mutates embedState so the next turn elides files that did not change.
 */
export function buildMessages(
  project: ContextProject,
  history: HistoryEntry[],
  kidMessageRedacted: string,
  embedState: EmbedState,
  safety: ContextSafety,
): ModelMessage[] {
  const messages: ModelMessage[] = trimHistory(history).map((entry) =>
    entry.role === 'kid'
      ? { role: 'user', content: entry.text }
      : { role: 'assistant', content: entry.text },
  );

  const sections: string[] = [];

  const notes = capLines(safety.prefilterContext(project.readTermiMd()), TERMI_MD_LINE_CAP);
  sections.push('<project_notes>', notes, '</project_notes>');

  const files = project.listKidFiles();
  const seen = new Set<string>();
  const unchangedLines: string[] = [];
  for (const file of files) {
    seen.add(file.relPath);
    const content = project.readFile(file.relPath);
    if (content === null) {
      continue;
    }
    const sha = sha256Hex(content);
    if (embedState.get(file.relPath) === sha) {
      const comment = firstCommentLine(content);
      unchangedLines.push(
        `${file.relPath} (${file.bytes} bytes)${comment !== null ? ` : ${comment}` : ''}`,
      );
    } else {
      embedState.set(file.relPath, sha);
      sections.push(
        `<project_file path="${file.relPath}">`,
        safety.prefilterContext(content),
        '</project_file>',
      );
    }
  }
  for (const key of [...embedState.keys()]) {
    if (!seen.has(key)) {
      embedState.delete(key);
    }
  }
  if (unchangedLines.length > 0) {
    sections.push(
      '<project_file_list note="unchanged files; call read_file to open one">',
      ...unchangedLines,
      '</project_file_list>',
    );
  }

  sections.push('<kid_message>', safety.prefilterContext(kidMessageRedacted), '</kid_message>');

  messages.push({ role: 'user', content: sections.join('\n') });
  return messages;
}

/** The providerOptions shape the AI SDK accepts (per call and per message). */
export type TurnProviderOptions = NonNullable<SystemModelMessage['providerOptions']>;

export interface ProviderTurnOptions {
  /** Top-level providerOptions for the streamText call. */
  call: TurnProviderOptions;
  /** providerOptions attached to the system message (prompt cache control). */
  system: TurnProviderOptions;
}

/**
 * Per-provider options for one turn. Anthropic gets an ephemeral cache point
 * on the stable system message. The ChatGPT sign-in path runs stateless with
 * encrypted reasoning passthrough. Everyone else relies on automatic prefix
 * caching, so the prefix is never reordered and nothing extra is sent.
 */
export function providerOptionsFor(providerId: ProviderId): ProviderTurnOptions {
  switch (providerId) {
    case 'anthropic':
      return { call: {}, system: { anthropic: { cacheControl: { type: 'ephemeral' } } } };
    case 'openai-chatgpt':
      return {
        call: { openai: { store: false, include: ['reasoning.encrypted_content'] } },
        system: {},
      };
    case 'openai-api':
    case 'xai':
      return { call: {}, system: {} };
  }
}
