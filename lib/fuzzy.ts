/**
 * Fuzzy Matching Utility for Vyapar Sarthi Agent
 */

/**
 * Calculates the Levenshtein distance between two strings.
 */
function levenshtein(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[len1][len2];
}

/**
 * Returns a similarity score between 0 and 1.
 */
export function getSimilarity(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();

  if (str1 === str2) return 1.0;
  
  // If one contains the other, high score
  if (str1.includes(str2) || str2.includes(str1)) {
    return Math.min(str1.length, str2.length) / Math.max(str1.length, str2.length) * 0.9 + 0.1;
  }

  const distance = levenshtein(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  return (maxLength - distance) / maxLength;
}

/**
 * Finds the best match for a query in a list of items.
 */
export function findBestMatch<T>(
  query: string,
  items: T[],
  getName: (item: T) => string,
  threshold = 0.75
): T | null {
  let bestScore = 0;
  let bestMatch: T | null = null;

  for (const item of items) {
    const score = getSimilarity(query, getName(item));
    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestScore >= threshold ? bestMatch : null;
}
