/**
 * On-device safety classifier contract for Qwen3Guard-Gen-0.6B.
 *
 * Pure functions only: prompt segments, output parsing, and the mapping
 * from guard categories onto Termi's taxonomy. The llama.cpp runtime that
 * feeds these lives in guardrunner.ts so everything here stays testable
 * without a model file.
 *
 * The prompt wrapper reproduces the classification template that ships in
 * the model's tokenizer config, byte for byte. Judged text never becomes
 * part of the wrapper: the runner tokenizes wrapper segments and judged
 * segments separately, so special tokens inside kid content stay plain text.
 */

import type { ClassifierVerdict, SafetyCategory } from '../types.js';
import { blockMessage, severityBlocks } from './taxonomy.js';

/** Category names exactly as the guard model prints them. */
export const GUARD_CATEGORIES = [
  'Violent',
  'Non-violent Illegal Acts',
  'Sexual Content or Sexual Acts',
  'PII',
  'Suicide & Self-Harm',
  'Unethical Acts',
  'Politically Sensitive Topics',
  'Copyright Violation',
  'Jailbreak',
] as const;

export type GuardCategory = (typeof GUARD_CATEGORIES)[number];

/** Where each guard category lands in Termi's taxonomy. */
export const GUARD_TO_TERMI: Record<GuardCategory, SafetyCategory> = {
  Violent: 'violence',
  'Non-violent Illegal Acts': 'illicit',
  'Sexual Content or Sexual Acts': 'sexual',
  PII: 'pii',
  'Suicide & Self-Harm': 'self_harm',
  'Unethical Acts': 'illicit',
  'Politically Sensitive Topics': 'adult_advice',
  'Copyright Violation': 'copyright',
  Jailbreak: 'jailbreak',
};

export type GuardLevel = 'Safe' | 'Unsafe' | 'Controversial';

export interface GuardReading {
  level: GuardLevel;
  categories: GuardCategory[];
  /** Only present on output checks. Not used for blocking. */
  refusal: boolean | null;
}

/** One piece of the guard prompt. 'fixed' text is ours; 'judged' is data. */
export interface GuardSegment {
  kind: 'fixed' | 'judged';
  text: string;
}

const CATEGORY_BLOCK = GUARD_CATEGORIES.map((c) => `${c}.`).join('\n');
const CATEGORY_BLOCK_NO_JAILBREAK = GUARD_CATEGORIES.filter((c) => c !== 'Jailbreak')
  .map((c) => `${c}.`)
  .join('\n');

const INPUT_HEADER =
  '<|im_start|>user\n' +
  '# Task:\n' +
  "1) Evaluate whether THE LAST USER's query belongs to safe or unsafe content based on our safety policy.\n" +
  '2) Identify the category of unsafe content found.\n' +
  '\n' +
  '<BEGIN SAFETY POLICY>\n' +
  "**Safety: Safe**: The USER's query does not contain any prohibited content or content that could lead to prohibited content.\n" +
  "**Safety: Unsafe**: The USER's query contains prohibited content.\n" +
  "**Safety: Controversial**: The USER's query does not explicitly contain prohibited content, but its intent, context, or potential responses could be misinterpreted, misused, or exploited to generate unsafe content under certain conditions.\n" +
  '<END SAFETY POLICY>\n' +
  '\n' +
  '<BEGIN UNSAFE CONTENT CATEGORIES>\n' +
  `${CATEGORY_BLOCK}\n` +
  '<END UNSAFE CONTENT CATEGORIES>\n' +
  '\n' +
  '<BEGIN CONVERSATION>\n' +
  '\n';

const INPUT_FOOTER =
  '\n' +
  '\n' +
  '<END CONVERSATION>\n' +
  '\n' +
  "Provide your safety assessment for ONLY THE LAST **USER's query** in the above conversation:\n" +
  " - The first line must be one of: 'Safety: Safe', 'Safety: Unsafe', 'Safety: Controversial'.\n" +
  " - The second line should start with 'Categories:' followed by a list of any unsafe content categories, separated by commas. If the content is safe, use 'Categories: None'.<|im_end|>\n" +
  '<|im_start|>assistant\n' +
  '<think>\n' +
  '\n' +
  '</think>\n' +
  '\n';

const OUTPUT_HEADER =
  '<|im_start|>user\n' +
  '# Task:\n' +
  "1) Evaluate whether THE LAST ASSISTANT's response belongs to safe or unsafe content based on our safety policy.\n" +
  '2) Identify the category of unsafe content found.\n' +
  "3) Determine if THE LAST ASSISTANT's response is a refusal to the USER's query.\n" +
  '\n' +
  '<BEGIN SAFETY POLICY>\n' +
  "**Safety: Safe**: The ASSISTANT's response does not contain any prohibited content or content that could lead to prohibited content.\n" +
  "**Safety: Unsafe**: The ASSISTANT's response contains prohibited content.\n" +
  "**Safety: Controversial**: The ASSISTANT's response is not explicitly harmful, but could become risky or offensive depending on context or audience.\n" +
  '<END SAFETY POLICY>\n' +
  '\n' +
  '<BEGIN UNSAFE CONTENT CATEGORIES>\n' +
  `${CATEGORY_BLOCK_NO_JAILBREAK}\n` +
  '<END UNSAFE CONTENT CATEGORIES>\n' +
  '\n' +
  '<BEGIN REFUSAL POLICY>\n' +
  "**Refusal: Yes**: The ASSISTANT refused to answer or did not comply with the USER's request.\n" +
  "**Refusal: No**: The ASSISTANT directly answered or complied with the USER's request.\n" +
  '<END REFUSAL POLICY>\n' +
  '\n' +
  '<BEGIN CONVERSATION>\n' +
  '\n';

const OUTPUT_FOOTER =
  '\n' +
  '\n' +
  '<END CONVERSATION>\n' +
  '\n' +
  "Provide your safety assessment for ONLY THE LAST **ASSISTANT's response** in the above conversation:\n" +
  " - The first line must be one of: 'Safety: Safe', 'Safety: Unsafe', 'Safety: Controversial'.\n" +
  " - The second line should start with 'Categories:' followed by a list of any unsafe content categories, separated by commas. If the content is safe, use 'Categories: None'.\n" +
  " - The third line must be one of: 'Refusal: Yes', 'Refusal: No'.<|im_end|>\n" +
  '<|im_start|>assistant\n' +
  '<think>\n' +
  '\n' +
  '</think>\n' +
  '\n';

/** Longest judged text accepted per call. Callers chunk well below this. */
export const GUARD_TEXT_CAP = 6000;

/**
 * Judged text is data. The wrapper's conversation markers are defanged and
 * chat-control glyph pairs are broken so judged content can never read as
 * template structure. Token-level injection is impossible regardless (the
 * runner never parses special tokens in judged segments); this guards the
 * plain-text layer.
 */
export function sanitizeJudged(text: string): string {
  return text
    .slice(0, GUARD_TEXT_CAP)
    .replace(/\u0000/g, '')
    .replace(/<\|/g, '< |')
    .replace(/<(\/?)(BEGIN|END) (CONVERSATION|SAFETY POLICY|UNSAFE CONTENT CATEGORIES|REFUSAL POLICY)>/gi, '($2 $3)')
    // Verdict-shaped lines inside judged text lose their colon so an echo
    // can never look like the guard's own output (the parser is anchored
    // to the first line anyway; this also avoids needless blocks when a
    // kid literally types a verdict-shaped line).
    .replace(/^(\s*)(Safety|Categories|Refusal)(\s*):/gim, '$1$2$3;');
}

/** Prompt segments for judging something the kid typed. */
export function buildInputSegments(kidText: string): GuardSegment[] {
  return [
    { kind: 'fixed', text: `${INPUT_HEADER}USER: ` },
    { kind: 'judged', text: sanitizeJudged(kidText) },
    { kind: 'fixed', text: INPUT_FOOTER },
  ];
}

/**
 * Prompt segments for judging text the app produced (a reply or file text).
 * The kid's last message gives the model the exchange it was trained on;
 * file checks pass an empty string and get a neutral stand-in.
 */
export function buildOutputSegments(kidText: string, producedText: string): GuardSegment[] {
  const kid = sanitizeJudged(kidText.slice(0, 500)).trim() || 'Please help me with my project.';
  return [
    { kind: 'fixed', text: `${OUTPUT_HEADER}USER: ` },
    { kind: 'judged', text: kid },
    { kind: 'fixed', text: '\n\nASSISTANT: ' },
    { kind: 'judged', text: sanitizeJudged(producedText) },
    { kind: 'fixed', text: OUTPUT_FOOTER },
  ];
}

/** Flattens segments into the exact prompt string (tests and debugging). */
export function renderSegments(segments: GuardSegment[]): string {
  return segments.map((s) => s.text).join('');
}

const GUARD_NAME_LOOKUP = new Map<string, GuardCategory>(
  GUARD_CATEGORIES.map((c) => [c.toLowerCase(), c]),
);

/**
 * Parses the guard completion. The verdict must LEAD it: the first
 * non-empty line has to be the Safety line, and Categories/Refusal are
 * read only from the two lines after it. A completion that opens with
 * anything else, including an induced echo of judged text, throws, and
 * the caller turns that into a fail-closed block.
 */
export function parseGuardReading(raw: string): GuardReading {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const safety = /^Safety:\s*(Safe|Unsafe|Controversial)\b/i.exec(lines[0] ?? '');
  if (safety === null) {
    throw new Error('guard-verdict-missing');
  }
  const matched = safety[1]!.toLowerCase();
  const level = (matched.charAt(0).toUpperCase() + matched.slice(1)) as GuardLevel;

  const window = lines.slice(1, 3);
  const categories: GuardCategory[] = [];
  const catLine = window.map((l) => /^Categories:\s*(.+)$/i.exec(l)).find((m) => m !== null);
  if (catLine !== undefined && catLine !== null) {
    for (const piece of catLine[1]!.split(',')) {
      const name = piece.trim().replace(/[.]+$/, '').trim();
      if (name.length === 0 || /^none$/i.test(name)) {
        continue;
      }
      const known = GUARD_NAME_LOOKUP.get(name.toLowerCase());
      if (known !== undefined && !categories.includes(known)) {
        categories.push(known);
      }
    }
  }

  const refusalLine = window.map((l) => /^Refusal:\s*(Yes|No)\b/i.exec(l)).find((m) => m !== null);
  const refusal =
    refusalLine === undefined || refusalLine === null ? null : /yes/i.test(refusalLine[1]!);

  return { level, categories, refusal };
}

/** Severity for a guard level: Unsafe 2, Controversial 1, Safe 0. */
export function guardSeverity(level: GuardLevel): 0 | 1 | 2 {
  if (level === 'Unsafe') return 2;
  if (level === 'Controversial') return 1;
  return 0;
}

/**
 * Maps a guard reading onto Termi's verdict shape. Unsafe always blocks
 * (every category's threshold is at or below severity 2, and an Unsafe
 * reading with no recognizable category still blocks generically rather
 * than sliding through). Controversial blocks only the severity-1
 * categories (pii, jailbreak), matching the taxonomy thresholds.
 */
export function guardVerdict(reading: GuardReading): ClassifierVerdict {
  const severity = guardSeverity(reading.level);
  const categories: SafetyCategory[] = [];
  for (const guardCategory of reading.categories) {
    const mapped = GUARD_TO_TERMI[guardCategory];
    if (!categories.includes(mapped)) {
      categories.push(mapped);
    }
  }
  const blocked =
    reading.level === 'Unsafe' ? true : severityBlocks(categories, severity);
  return {
    allowed: !blocked,
    categories,
    severity,
    selfHarmConcern: categories.includes('self_harm'),
    failClosed: false,
    kidMessage: blocked ? blockMessage(categories) : null,
  };
}
