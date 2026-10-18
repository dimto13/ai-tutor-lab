/** Lower-cased, punctuation-free form of a learner message that the tutor patterns match on. */
export function normalizeTutorText(value: string): string {
  return value
    .toLocaleLowerCase("de")
    .replace(/[._/\\-]+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Matches the pattern only as whole words, so "tipp" does not hit "tippe". */
export function wholeWords(source: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, "u");
}
