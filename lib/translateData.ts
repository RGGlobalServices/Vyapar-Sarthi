/**
 * Data Translation Utility
 * Translates product names, categories, and units dynamically based on locale.
 */

const DATA_MAPS: Record<string, Record<string, string>> = {
  hi: {
    // Categories
    'Oil': 'तेल',
    'Spice': 'मसाला',
    'Atta': 'आटा',
    'Soap': 'साबुन',
    'Pulses': 'दाल',
    'Sugar': 'चीनी',
    'Detergent': 'डिटर्जेंट',
    'Rice': 'चावल',
    'Salt': 'नमक',
    'Tea': 'चाय',
    'Milk': 'दूध',
    'Snacks': 'स्नैक्स',
    'Cleaning': 'सफाई',
    'General': 'सामान्य',
    
    // Units
    'Ltr': 'लीटर',
    'Kg': 'किलो',
    'ki': 'किलो',
    'Gram': 'ग्राम',
    'g': 'ग्राम',
    'Packet': 'पैकेट',
    'Unit': 'इकाई',
    'Bottle': 'बोतल',
    'Box': 'बॉक्स',
    'Goni': 'गोनी',

    // Common Products
    'Fortune Oil': 'Fortune तेल',
    'Tata Salt': 'Tata नमक',
    'Ashirwad Atta': 'आशीर्वाद आटा',
    'Santoor Soap': 'संतूर साबुन',
    'Toor Dal': 'तूर दाल',
    'Surf Excel': 'सर्फ एक्सेल',
    'Basmati Rice': 'बासमती चावल',
  },
  mr: {
    // Categories
    'Oil': 'तेल',
    'Spice': 'मसाला',
    'Atta': 'पीठ',
    'Soap': 'साबण',
    'Pulses': 'डाळ',
    'Sugar': 'साखर',
    'Detergent': 'डिटर्जंट',
    'Rice': 'तांदूळ',
    'Salt': 'मीठ',
    'Tea': 'चहा',
    'Milk': 'दूध',
    'Snacks': 'स्नॅक्स',
    'Cleaning': 'साफसफाई',
    'General': 'सामान्य',

    // Units
    'Ltr': 'लिटर',
    'Kg': 'किलो',
    'kg': 'किलो',
    'ki': 'किलो',
    'Gram': 'ग्रॅम',
    'g': 'ग्रॅम',
    'Packet': 'पाकीट',
    'Unit': 'एकक',
    'Bottle': 'बाटली',
    'Box': 'बॉक्स',
    'Goni': 'गोणी',

    // Common Products
    'Fortune Oil': 'Fortune तेल',
    'Tata Salt': 'Tata मीठ',
    'Ashirwad Atta': 'आशीर्वाद पीठ',
    'Santoor Soap': 'संतूर साबण',
    'Toor Dal': 'तूर डाळ',
    'Surf Excel': 'सर्फ एक्सेल',
    'Basmati Rice': 'बासमती तांदूळ',
  }
};

export function translateData(text: string | null | undefined, locale: string): string {
  if (!text) return '';
  const cleanText = text.trim();
  
  // Handle locale variants like mr-IN or hi-IN
  const lang = locale.split('-')[0].toLowerCase();
  if (lang === 'en') return cleanText;

  const map = DATA_MAPS[lang];
  if (!map) return cleanText;

  // 1. Direct match (Exact case or Case-insensitive)
  if (map[cleanText]) return map[cleanText];
  
  // Case-insensitive direct match lookup
  const lowerText = cleanText.toLowerCase();
  const ciMatch = Object.entries(map).find(([k]) => k.toLowerCase() === lowerText);
  if (ciMatch) return ciMatch[1];

  // 2. Partial match (Common for products like "Fortune Oil 1L")
  // Sort keys by length descending to match "Fortune Oil" before "Oil"
  const sortedKeys = Object.keys(map).sort((a, b) => b.length - a.length);

  let result = cleanText;
  let translated = false;

  for (const key of sortedKeys) {
    if (!result.toLowerCase().includes(key.toLowerCase())) continue;

    const value = map[key];
    // Short keys (≤3 chars, e.g. 'g', 'ki', 'Kg') must match as whole words only
    // to avoid replacing letters inside brand names like "Maggie" or "Sugar"
    const pattern = key.length <= 3
      ? `(?<![\\w\\u0900-\\u097F])${key}(?![\\w\\u0900-\\u097F])`
      : key;

    const regex = new RegExp(pattern, 'gi');
    const next = result.replace(regex, value);
    if (next !== result) {
      result = next;
      translated = true;
    }
  }

  return translated ? result : cleanText;
}
