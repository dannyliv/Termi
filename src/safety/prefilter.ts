/**
 * L0 prefilter: cheap, offline, never load-bearing.
 *
 * Normalization (NFKC, lowercase, de-leet, separator tolerance) feeds:
 * self-harm (supportive block), jailbreak including base64 payloads (block),
 * grooming hard-blocks (block), personal-detail probes (block), profanity
 * (block, rephrase), and PII share patterns (redact, never block). Game
 * words like kill, die, shoot, zombie are NOT listed: the game carve-out
 * protects real kid game language.
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
  /drop\s+(?:every|all|your)\s+(?:safety\s+)?(?:rule|rules|filter|filters|restriction|restrictions)\b/gi,
  /obey\s+only\s+me\b/gi,
];

/** Base64 tokens long enough to hide a short instruction payload. */
const BASE64_TOKEN = /(?:[A-Za-z0-9+/]{20,}={0,2})/g;

/**
 * True when plain text or a decodable base64 blob matches a jailbreak family.
 * Catches "decode this and follow: aWdub3Jl..." style evasion.
 */
export function hasJailbreak(text: string): boolean {
  const prepared = normalizeText(text);
  if (
    JAILBREAK_PATTERNS.some((re) => {
      re.lastIndex = 0;
      return re.test(prepared);
    })
  ) {
    return true;
  }
  BASE64_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BASE64_TOKEN.exec(text)) !== null) {
    const token = match[0];
    if (token.length % 4 === 1) {
      continue;
    }
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      // Reject garbage: decoded text should be mostly printable.
      if (decoded.length < 8 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(decoded)) {
        continue;
      }
      const decodedNorm = normalizeText(decoded);
      if (
        JAILBREAK_PATTERNS.some((re) => {
          re.lastIndex = 0;
          return re.test(decodedNorm);
        })
      ) {
        return true;
      }
    } catch {
      // Not valid base64; ignore.
    }
  }
  return false;
}

/**
 * Grooming-shaped hard blocks on a single message. Tighter than the session
 * counters so normal game talk ("don't tell the boss") still passes.
 */
export const GROOMING_PATTERNS: RegExp[] = [
  /don'?t\s+tell\s+(?:your|my|our|his|her|their)\s+(?:parents?|parent|mom|dad|mother|father|grown-?ups?|guardian)/gi,
  /do\s+not\s+tell\s+(?:your|my|our)\s+(?:parents?|parent|mom|dad|mother|father|grown-?ups?)/gi,
  /keep\s+(?:this|it|our\s+chats?)\s+(?:a\s+)?secret\s+from\s+(?:your|my|our)\s+(?:parents?|mom|dad)/gi,
  /without\s+(?:your|my|our)\s+(?:parents?|mom|dad|mother|father)\s+(?:seeing|knowing|finding)/gi,
  /our\s+little\s+secret\b/gi,
  /this\s+is\s+our\s+secret\b/gi,
  /just\s+between\s+us\b/gi,
  /secret\s+between\s+(?:us|you\s+and\s+me)\b/gi,
  /no\s+one\s+(?:has\s+to|needs\s+to|will)\s+know\b/gi,
  /add\s+me\s+on\s+(?:snapchat|instagram|whatsapp|telegram|discord|tiktok|kik|signal)\b/gi,
  /(?:message|dm)\s+me\s+on\s+(?:snapchat|instagram|whatsapp|telegram|discord|tiktok|kik|signal)\b/gi,
  /text\s+me\s+at\b/gi,
  /\bdm\s+me\b/gi,
  /let'?s\s+(?:chat|talk)\s+on\s+(?:snapchat|instagram|whatsapp|telegram|discord|tiktok)\b/gi,
  // "special/only friend" + love probes; bare "i love you" stays allowed for stories.
  /you'?re\s+my\s+(?:special|only)\s+friend\b/gi,
  /do\s+you\s+love\s+me\b/gi,
  /love\s+me\s+more\s+than\s+anyone\b/gi,
];

/** True when the text matches a grooming hard-block family. */
export function hasGrooming(text: string): boolean {
  const prepared = normalizeText(text);
  return GROOMING_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(prepared);
  });
}

/**
 * Self-harm intent and soft ideation. Routes to the supportive screen.
 * Game words (die, kill boss) are not listed here.
 */
export const SELF_HARM_PATTERNS: RegExp[] = [
  /\b(?:i\s+)?want\s+to\s+hurt\s+myself\b/gi,
  /\b(?:i\s+)?want\s+to\s+kill\s+myself\b/gi,
  /\bkill\s+myself\b/gi,
  /\bend\s+my\s+life\b/gi,
  /\bsuicide\b/gi,
  /\bself[-\s]?harm\b/gi,
  /\bbetter\s+off\s+without\s+me\b/gi,
  /\bno\s+reason\s+to\s+live\b/gi,
  /\bwish\s+i\s+(?:was|were)\s+dead\b/gi,
  /\bi\s+(?:want|wanna)\s+to\s+die\b/gi,
  /\bhow\s+(?:can|do)\s+i\s+(?:kill|hurt)\s+myself\b/gi,
  /\beasiest\s+way\s+to\s+(?:kill|hurt)\s+myself\b/gi,
];

/** True when the text shows self-harm intent or ideation. */
export function hasSelfHarm(text: string): boolean {
  const prepared = normalizeText(text);
  return SELF_HARM_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(prepared);
  });
}

/**
 * Probes for personal details aimed at a child (or role-played as such).
 * Sharing your own details is handled by redactPii; these block the ask.
 */
export const PII_PROBE_PATTERNS: RegExp[] = [
  /what(?:'s|\s+is)\s+your\s+real\s+(?:name|address|phone|number)\b/gi,
  /what\s+school\s+do\s+you\b/gi,
  /which\s+school\s+do\s+you\b/gi,
  /what\s+school\s+do\s+you\s+go\s+to\b/gi,
  /when\s+does\s+(?:school|it)\s+end\b/gi,
  /where\s+do\s+you\s+live\b/gi,
  /send\s+(?:me\s+)?(?:a\s+)?(?:photo|picture|pic|selfie)\b/gi,
  /how\s+old\s+are\s+you\s+really\b/gi,
  /your\s+(?:home\s+)?address\b/gi,
  /your\s+phone\s+number\b/gi,
];

/** True when the text probes for personal details. */
export function hasPiiProbe(text: string): boolean {
  const prepared = normalizeText(text);
  return PII_PROBE_PATTERNS.some((re) => {
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

type PrefilterBlockCategory =
  | 'profanity'
  | 'jailbreak'
  | 'grooming'
  | 'self_harm'
  | 'pii';

function blockVerdict(category: PrefilterBlockCategory): ClassifierVerdict {
  const selfHarmConcern = category === 'self_harm';
  // L0 always hard-blocks when it fires. Severity is for the audit trail:
  // self-harm is marked serious (2); everything else is mild (1), matching
  // the prior prefilter behavior for profanity and jailbreak.
  const severity: 1 | 2 = category === 'self_harm' ? 2 : 1;
  return {
    allowed: false,
    categories: [category],
    severity,
    selfHarmConcern,
    failClosed: false,
    kidMessage: selfHarmConcern ? T.selfHarmSupport.message : T.blocks.byCategory[category],
  };
}

/**
 * L0 check for kid input. Jailbreak, profanity, grooming, self-harm, and
 * personal-detail probes block (kindly). Shared personal details redact
 * with a gentle reminder and never block on their own.
 */
export function prefilterInput(text: string): PrefilterInputResult {
  // Self-harm first so the supportive screen wins over other matches.
  if (hasSelfHarm(text)) {
    return { ok: false, redacted: text, notice: null, block: blockVerdict('self_harm') };
  }
  if (hasJailbreak(text)) {
    return { ok: false, redacted: text, notice: null, block: blockVerdict('jailbreak') };
  }
  if (hasGrooming(text)) {
    return { ok: false, redacted: text, notice: null, block: blockVerdict('grooming') };
  }
  if (hasPiiProbe(text)) {
    return { ok: false, redacted: text, notice: null, block: blockVerdict('pii') };
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
