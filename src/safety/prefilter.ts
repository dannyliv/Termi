/**
 * L0 prefilter: cheap, offline, never load-bearing.
 *
 * Normalization (NFKC, lowercase, de-leet, separator tolerance) feeds three
 * checks: a profanity wordlist (block, ask to rephrase), PII patterns
 * (redact, never block), and jailbreak families (block on input; neutralize
 * in file context). Game words like kill, die, shoot, zombie are NOT here:
 * the game carve-out protects real kid game language.
 */

import type { ClassifierVerdict, PrefilterInputResult } from '../types.js';
import { T } from '../ui/text.js';

/** Leetspeak character map applied during normalization. */
const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/** NFKC normalize and lowercase. The shared first step. */
export function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

/** Normalize plus de-leet, used for wordlist matching only. */
export function deleetText(text: string): string {
  return normalizeText(text).replace(/[01345781@$!]/g, (ch) => LEET_MAP[ch] ?? ch);
}

/**
 * Genuinely profane or slur terms only. Whole-word matched with separator
 * tolerance ("f.u.c.k" still matches). Game words (kill, die, shoot, dead,
 * blood, ghost, zombie, fight) are deliberately absent.
 */
export const PROFANITY_WORDS: string[] = [
  'fuck',
  'fucker',
  'fucking',
  'motherfucker',
  'shit',
  'bullshit',
  'shitty',
  'bitch',
  'bitches',
  'cunt',
  'asshole',
  'arsehole',
  'bastard',
  'dick',
  'dickhead',
  'cock',
  'cocksucker',
  'pussy',
  'slut',
  'whore',
  'faggot',
  'fag',
  'nigger',
  'nigga',
  'retard',
  'retarded',
  'dumbass',
  'jackass',
  'douchebag',
  'twat',
  'wanker',
  'prick',
];

/** Separators kids use to dodge filters: spaces, dots, dashes, stars, underscores. */
const SEP = "[\\s.\\-_*+'’]*";

const profanityRegexes: RegExp[] = PROFANITY_WORDS.map((word) => {
  const letters = word.split('').join(SEP);
  return new RegExp(`(?<![a-z])${letters}(?![a-z])`, 'i');
});

/** True when the (already de-leeted) text contains a profane term. */
export function hasProfanity(text: string): boolean {
  const prepared = deleetText(text);
  return profanityRegexes.some((re) => re.test(prepared));
}

/**
 * Jailbreak families: instruction overrides, persona swaps, rule removal,
 * and system-prompt extraction. Matched case-insensitively on raw text so
 * the same patterns can neutralize in place for file context.
 */
export const JAILBREAK_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|earlier|above|your)\s+(?:instructions|rules|prompts?|directions)/gi,
  /disregard\s+(?:all\s+|any\s+)?(?:previous|prior|earlier|your)\s+(?:instructions|rules|prompts?)/gi,
  /forget\s+(?:all\s+|everything\s+about\s+)?(?:your|the)\s+(?:instructions|rules|training)/gi,
  /you\s+are\s+now\s+(?:dan|free|unfiltered|jailbroken|unrestricted|uncensored|evil)\b/gi,
  /you\s+are\s+now\s+(?:a|an)\s+(?:ai|assistant|model|chatbot|bot)\b[^.!?\n]{0,60}/gi,
  /pretend\s+(?:that\s+)?you\s+(?:have\s+no|do\s*n[o']t\s+have(?:\s+any)?)\s+(?:rules|filters|restrictions|limits|guidelines)/gi,
  /act\s+as\s+(?:if\s+you\s+have\s+no|though\s+you\s+have\s+no)\s+(?:rules|filters|restrictions)/gi,
  /(?:enable|enter|activate)\s+(?:developer|dev|god|jailbreak|dan)\s+mode/gi,
  /(?:answer|respond|reply|act|behave|talk)\s+without\s+(?:any\s+)?(?:rules|filters|restrictions|safety|censorship)\b/gi,
  /without\s+(?:any\s+)?(?:filters|restrictions|censorship)\b/gi,
  /bypass\s+(?:the\s+|your\s+)?(?:safety|filter|filters|rules|restrictions|guardrails)/gi,
  /(?:show|tell|give|reveal|print|repeat|output)\s+(?:me\s+)?your\s+(?:hidden\s+|system\s+|secret\s+|initial\s+|original\s+)?(?:system\s+)?(?:prompt|instructions|rules)\b/gi,
  /what\s+(?:is|are)\s+your\s+(?:system\s+prompt|hidden\s+(?:rules|instructions)|original\s+instructions)/gi,
  /new\s+(?:system\s+)?instructions?\s*:/gi,
  /\bsystem\s*prompt\s*override\b/gi,
];

/** True when the text matches a jailbreak family. */
export function hasJailbreak(text: string): boolean {
  const prepared = normalizeText(text);
  return JAILBREAK_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(prepared);
  });
}

interface PiiPattern {
  name: string;
  regex: RegExp;
}

/** PII patterns used for redaction of kid input. Replacement is [secret]. */
export const PII_PATTERNS: PiiPattern[] = [
  {
    name: 'email',
    regex: /[a-z0-9._%+-]+@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/gi,
  },
  {
    // 9+ digits with optional spacing or punctuation: phone numbers, not game scores.
    name: 'phone',
    regex: /\+?\d(?:[\s().\-]?\d){8,}/g,
  },
  {
    name: 'street-address',
    regex:
      /\b\d{1,5}\s+(?:[a-z]+\s+){0,2}(?:street|avenue|boulevard|road|lane|drive|st|ave|blvd|rd|ln|dr)\b\.?/gi,
  },
  {
    name: 'address-intro',
    regex: /\bmy (?:home )?address is\s+[^.!?\n]{2,80}/gi,
  },
  {
    name: 'school',
    regex: /\bmy school is(?:\s+called)?\s+[^.!?\n]{2,60}/gi,
  },
  {
    name: 'school-attend',
    regex: /\bi go to\s+[^.!?\n]{2,40}\bschool\b/gi,
  },
  {
    name: 'full-name',
    regex: /\bmy (?:real |full )?name is\s+[a-z]+(?:\s+[a-z]+){1,3}\b/gi,
  },
  {
    name: 'last-name',
    regex: /\bmy last name is\s+[a-z]+\b/gi,
  },
];

export interface RedactionResult {
  redacted: string;
  found: boolean;
}

/** Masks PII spans with [secret]. Works on the original text, not normalized. */
export function redactPii(text: string): RedactionResult {
  let redacted = text;
  let found = false;
  for (const { regex } of PII_PATTERNS) {
    regex.lastIndex = 0;
    if (regex.test(redacted)) {
      found = true;
      regex.lastIndex = 0;
      redacted = redacted.replace(regex, '[secret]');
    }
  }
  return { redacted, found };
}

function blockVerdict(category: 'profanity' | 'jailbreak'): ClassifierVerdict {
  return {
    allowed: false,
    categories: [category],
    severity: 1,
    selfHarmConcern: false,
    failClosed: false,
    kidMessage: T.blocks.byCategory[category],
  };
}

/**
 * L0 check for kid input. Jailbreak and profanity block (kindly).
 * PII redacts with a gentle reminder, never blocks.
 */
export function prefilterInput(text: string): PrefilterInputResult {
  if (hasJailbreak(text)) {
    return { ok: false, redacted: text, notice: null, block: blockVerdict('jailbreak') };
  }
  if (hasProfanity(text)) {
    return { ok: false, redacted: text, notice: null, block: blockVerdict('profanity') };
  }
  const { redacted, found } = redactPii(text);
  if (found) {
    return { ok: true, redacted, notice: T.chat.piiReminder, block: null };
  }
  return { ok: true, redacted: text, notice: null, block: null };
}

/**
 * True when a kid-chosen name (project name, nickname) is safe to use.
 * Names ride inside the trusted system prompt, scaffold titles, and menus,
 * so profanity, jailbreak phrasing, and personal details are all refused.
 */
export function nameIsOkay(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return false;
  }
  const result = prefilterInput(trimmed);
  return result.block === null && result.notice === null && result.redacted === trimmed;
}

/**
 * L0 pass for file and notes content fed back to the model. Jailbreak
 * phrasing is neutralized in place with [removed]. Never blocks: project
 * files belong to the kid and stay readable.
 */
export function prefilterContext(text: string): string {
  let result = text;
  for (const re of JAILBREAK_PATTERNS) {
    re.lastIndex = 0;
    result = result.replace(re, '[removed]');
  }
  return result;
}
