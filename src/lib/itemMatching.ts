/**
 * Utility functions for fuzzy matching parsed sales items to menu items
 */

export interface MatchResult {
  item: { id: string; name: string } | null;
  confidence: 'exact' | 'normalized' | 'fuzzy' | 'none';
}

/**
 * Normalize an item name for matching:
 * - Lowercase
 * - Remove size prefixes (6oz, 7oz, 8oz, 10oz, etc.)
 * - Remove "Half" or "Full" prefixes
 * - Trim whitespace
 */
export const normalizeItemName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/^\d+\s*oz\.?\s*/i, '')      // Remove "6oz", "7oz", "10 oz." etc.
    // Note: "Half" and "Full" prefixes are preserved - these are distinct portion sizes
    .replace(/\s+/g, ' ')                  // Normalize whitespace
    .trim();
};

/**
 * Calculate simple similarity score between two strings
 * Returns a value between 0 and 1
 */
const calculateSimilarity = (str1: string, str2: string): number => {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 1;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    const shorter = s1.length < s2.length ? s1 : s2;
    const longer = s1.length >= s2.length ? s1 : s2;
    return shorter.length / longer.length;
  }
  
  // Simple word overlap scoring
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const commonWords = words1.filter(w => words2.includes(w));
  
  if (commonWords.length === 0) return 0;
  
  return commonWords.length / Math.max(words1.length, words2.length);
};

/**
 * Find the best matching menu item for a parsed item name
 */
export const findBestMatch = (
  parsedName: string,
  menuItems: { id: string; name: string }[]
): MatchResult => {
  if (!parsedName || menuItems.length === 0) {
    return { item: null, confidence: 'none' };
  }

  const normalizedParsed = normalizeItemName(parsedName);

  // 1. Try exact match (case-insensitive)
  const exactMatch = menuItems.find(
    m => m.name.toLowerCase() === parsedName.toLowerCase()
  );
  if (exactMatch) {
    return { item: exactMatch, confidence: 'exact' };
  }

  // 2. Try normalized match
  const normalizedMatch = menuItems.find(
    m => normalizeItemName(m.name) === normalizedParsed
  );
  if (normalizedMatch) {
    return { item: normalizedMatch, confidence: 'normalized' };
  }

  // 3. Try fuzzy matching with similarity scoring
  let bestMatch: { id: string; name: string } | null = null;
  let bestScore = 0;
  const FUZZY_THRESHOLD = 0.5; // Minimum similarity score to consider a match

  for (const menuItem of menuItems) {
    const score = calculateSimilarity(normalizedParsed, normalizeItemName(menuItem.name));
    if (score > bestScore && score >= FUZZY_THRESHOLD) {
      bestScore = score;
      bestMatch = menuItem;
    }
  }

  if (bestMatch) {
    return { item: bestMatch, confidence: 'fuzzy' };
  }

  return { item: null, confidence: 'none' };
};

/**
 * Get the display color class for a match confidence level
 */
export const getConfidenceColor = (confidence: MatchResult['confidence']): string => {
  switch (confidence) {
    case 'exact':
      return 'text-green-500';
    case 'normalized':
      return 'text-blue-500';
    case 'fuzzy':
      return 'text-yellow-500';
    default:
      return 'text-muted-foreground';
  }
};

/**
 * Get the display label for a match confidence level
 */
export const getConfidenceLabel = (confidence: MatchResult['confidence']): string => {
  switch (confidence) {
    case 'exact':
      return 'Exact';
    case 'normalized':
      return 'Partial';
    case 'fuzzy':
      return 'Fuzzy';
    default:
      return 'None';
  }
};
