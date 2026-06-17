/**
 * Smart Search Utility for Kirana Store
 * Handles:
 * 1. Phonetic/Fuzzy Matching (Local language transliteration)
 * 2. Category to Brand mapping (e.g., "soap" -> "Santoor", "Lux")
 * 3. Translation (Local terms to Inventory terms)
 */

type Product = {
  id: string;
  name: string;
  category?: string;
  barcode?: string;
  [key: string]: any;
};

// Common transliterations and translations
const SEARCH_MAPPINGS: Record<string, string[]> = {
  // Soaps
  'soap': ['sabun', 'saboon', 'saban', 'soop', 'shoap'],
  'sabun': ['soap', 'lux', 'santoor', 'dettol', 'lifebuoy', 'dove', 'pears'],
  
  // Flour/Atta
  'atta': ['pith', 'flour', 'gehu', 'gahu', 'ashirvad', 'aashirvaad'],
  'wheat': ['gehu', 'gahu', 'atta'],
  'pith': ['atta', 'flour'],

  // Oils
  'oil': ['tel', 'teel', 'tail', 'fortune', 'saffola', 'gemini'],
  'tel': ['oil', 'refined'],

  // Pulses/Dals
  'dal': ['daal', 'tur', 'moong', 'urad', 'masoor', 'chana'],
  'tur': ['dal', 'arhar'],

  // Sugar/Tea
  'sugar': ['sakhar', 'sakar', 'chini'],
  'tea': ['chai', 'chaat', 'taj', 'red label', 'wagh bakri'],
  
  // Others
  'milk': ['dudh', 'doodh', 'amul', 'mother dairy'],
  'rice': ['tandul', 'chawal', 'basmati', 'kolam'],
  'salt': ['meeth', 'namak', 'tata salt'],
};

/**
 * Fuzzy score between two strings (0-1, higher is better)
 * Uses a simplified Levenshtein-style approach for speed
 */
function getFuzzyScore(target: string, query: string): number {
  target = target.toLowerCase();
  query = query.toLowerCase();

  if (target.includes(query)) return 1.0;
  
  // Very basic distance check for spelling mistakes (max 1-2 chars)
  if (query.length < 3) return 0;

  // Let's implement a simple character overlap score
  let matches = 0;
  const qSet = new Set(query.split(''));
  for (const char of target) {
    if (qSet.has(char)) matches++;
  }
  
  const score = matches / Math.max(target.length, query.length);
  return score > 0.7 ? score : 0;
}

export function performSmartSearch(products: Product[], query: string): Product[] {
  if (!query) return [];
  const q = query.toLowerCase().trim();

  // 1. Direct matches (Highest priority)
  const directMatches = products.filter(p => 
    p.name.toLowerCase().includes(q) || 
    p.barcode?.includes(q) ||
    p.category?.toLowerCase().includes(q)
  );

  if (directMatches.length > 5) return directMatches;

  // 2. Mapping matches (Translation/Transliteration)
  let expandedTerms = [q];
  for (const [key, aliases] of Object.entries(SEARCH_MAPPINGS)) {
    if (q === key || aliases.includes(q)) {
      expandedTerms.push(key, ...aliases);
    }
  }
  
  // Unique terms
  expandedTerms = Array.from(new Set(expandedTerms));

  const mappingMatches = products.filter(p => {
    // Avoid double counting direct matches
    if (directMatches.some(dm => dm.id === p.id)) return false;

    return expandedTerms.some(term => 
      p.name.toLowerCase().includes(term) || 
      p.category?.toLowerCase().includes(term)
    );
  });

  // 3. Combine and sort
  const results = [...directMatches, ...mappingMatches];

  // 4. Fuzzy backup (Only if very few results)
  if (results.length < 3 && q.length > 3) {
    const fuzzyMatches = products
      .filter(p => !results.some(r => r.id === p.id))
      .map(p => ({ p, score: getFuzzyScore(p.name, q) }))
      .filter(m => m.score > 0.75)
      .sort((a, b) => b.score - a.score)
      .map(m => m.p);
    
    results.push(...fuzzyMatches);
  }

  return results.slice(0, 15); // Return top 15
}
