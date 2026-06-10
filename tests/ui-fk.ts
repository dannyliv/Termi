/**
 * Tiny Flesch-Kincaid grade estimator for the kid-copy tests.
 * Heuristic syllable counting: vowel groups, minus common silent endings.
 */

export function countSyllables(rawWord: string): number {
  const word = rawWord.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length === 0) return 1;
  if (word.length <= 3) return 1;
  let trimmed = word.replace(/(?:es|ed|e)$/, '');
  if (/[^aeiou]le$/.test(word)) {
    // Words like "little" keep the final syllable.
    trimmed = word.replace(/e$/, '');
  }
  const groups = trimmed.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function splitWords(text: string): string[] {
  return text
    .replace(/\{[a-zA-Z]+\}/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9']/g, ''))
    .filter((word) => word.length > 0);
}

/** Flesch-Kincaid grade level. Returns 0 for empty or tiny inputs. */
export function fkGrade(text: string): number {
  const words = splitWords(text);
  if (words.length === 0) return 0;
  const sentences = Math.max(1, splitSentences(text).length);
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const grade =
    0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  return Math.max(0, grade);
}

/** Longest sentence length in words, for the under-15-words rule. */
export function maxSentenceWords(text: string): number {
  const lengths = splitSentences(text).map((sentence) => splitWords(sentence).length);
  return lengths.length > 0 ? Math.max(...lengths) : 0;
}

/** Collect every string leaf from a nested copy object. */
export function collectStrings(value: unknown, path = 'T'): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => collectStrings(item, `${path}[${i}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      collectStrings(child, `${path}.${key}`),
    );
  }
  return [];
}

/** Em-dash, en-dash, figure dash, horizontal bar, minus sign. All banned. */
export const DASH_RE = new RegExp(
  '[\\u2010\\u2011\\u2012\\u2013\\u2014\\u2015\\u2212]',
);
