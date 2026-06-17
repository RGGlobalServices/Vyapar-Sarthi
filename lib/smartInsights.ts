/**
 * Smart Local Insight Engine
 * Zero API cost — pure rule-based analysis of store data.
 * Used as primary engine or fallback when Gemini is unavailable.
 */

export interface Product {
  name: string;
  category: string;
  stock: number;
  minStock: number;
  mrp: number;
  sellingPrice: number;
  cost: number;
}

export interface InsightsData {
  priceRecommendations: PriceRec[];
  stockAlerts: StockAlert[];
  profitAnalysis: { yesterday: ProfitDay };
  suggestions: Suggestion[];
  source: 'ai' | 'smart';
}

interface PriceRec {
  product: string;
  currentPrice: number;
  marketPrice: number;
  suggestion: string;
  trend: 'up' | 'down' | 'stable';
}
interface StockAlert {
  product: string;
  stock: number;
  minStock: number;
  urgency: 'critical' | 'low' | 'order_soon';
  message: string;
}
interface ProfitDay {
  sales: number;
  cost: number;
  profit: number;
  profitMargin: number;
  status: 'profit' | 'loss';
  summary: string;
}
interface Suggestion {
  title: string;
  detail: string;
  impact: 'high' | 'medium' | 'low';
  category: 'pricing' | 'stock' | 'marketing' | 'operations';
}

/* ── District-wise market price multipliers (vs MRP) ───────────────────
   These reflect real Maharashtra market conditions:
   Metro (Mumbai/Pune) = near MRP, Rural = 5-10% below MRP
──────────────────────────────────────────────────────────────────────── */
const DISTRICT_FACTOR: Record<string, number> = {
  Mumbai: 0.98, Pune: 0.96, Nagpur: 0.94, Nashik: 0.93,
  Aurangabad: 0.92, Kolhapur: 0.91, Solapur: 0.91, Satara: 0.90,
  Sangli: 0.90, Ahmednagar: 0.89, Latur: 0.88, Osmanabad: 0.87,
  Jalgaon: 0.88, Nanded: 0.87, Akola: 0.88,
};

/* ── Category margin benchmarks (healthy margin range) ─────────────── */
const CATEGORY_MARGIN: Record<string, { min: number; max: number }> = {
  Oil:       { min: 8,  max: 15 },
  Pulses:    { min: 10, max: 18 },
  Sugar:     { min: 5,  max: 10 },
  Detergent: { min: 15, max: 25 },
  Soap:      { min: 18, max: 30 },
  Grocery:   { min: 8,  max: 20 },
  Default:   { min: 10, max: 20 },
};

function margin(p: Product) {
  return p.sellingPrice > 0
    ? ((p.sellingPrice - p.cost) / p.sellingPrice) * 100
    : 0;
}

function marketPrice(p: Product, district: string) {
  const factor = DISTRICT_FACTOR[district] ?? 0.91;
  return Math.round(p.mrp * factor);
}

/* ── Price Recommendations ─────────────────────────────────────────── */
function buildPriceRecs(products: Product[], district: string, lang: string): PriceRec[] {
  const msgs = MESSAGES[lang as LocaleType] ?? MESSAGES.en;
  return products.map(p => {
    const mp = marketPrice(p, district);
    const diff = mp - p.sellingPrice;
    const pct  = Math.abs(diff / p.sellingPrice) * 100;

    let trend: PriceRec['trend'] = 'stable';
    let suggestion = '';

    if (diff > 5 && pct > 3) {
      trend = 'up';
      suggestion = msgs.priceUp(p.name, mp);
    } else if (diff < -5 && pct > 3) {
      trend = 'down';
      suggestion = msgs.priceDown(p.name, mp);
    } else {
      suggestion = msgs.priceOk(p.name);
    }

    return { product: p.name, currentPrice: p.sellingPrice, marketPrice: mp, suggestion, trend };
  });
}

/* ── Stock Alerts ──────────────────────────────────────────────────── */
function buildStockAlerts(products: Product[], lang: string): StockAlert[] {
  const msgs = MESSAGES[lang as LocaleType] ?? MESSAGES.en;
  const alerts: StockAlert[] = [];

  for (const p of products) {
    if (p.stock === 0) {
      alerts.push({
        product: p.name, stock: p.stock, minStock: p.minStock,
        urgency: 'critical', message: msgs.stockCritical(p.name),
      });
    } else if (p.stock < p.minStock) {
      alerts.push({
        product: p.name, stock: p.stock, minStock: p.minStock,
        urgency: 'low', message: msgs.stockLow(p.name, p.stock, p.minStock),
      });
    } else if (p.stock < p.minStock * 1.5) {
      alerts.push({
        product: p.name, stock: p.stock, minStock: p.minStock,
        urgency: 'order_soon', message: msgs.stockSoon(p.name),
      });
    }
  }
  return alerts;
}

/* ── Profit Analysis ───────────────────────────────────────────────── */
function buildProfit(summary: any, lang: string): ProfitDay {
  const msgs  = MESSAGES[lang as LocaleType] ?? MESSAGES.en;
  const sales = summary?.sales ?? 0;
  const cost  = summary?.cost ?? 0;
  const transactions = summary?.transactions ?? 0;
  const profit = sales - cost;
  const margin = sales > 0 ? Math.round((profit / sales) * 100 * 10) / 10 : 0;
  const status: 'profit' | 'loss' = profit >= 0 ? 'profit' : 'loss';
  return {
    sales,
    cost,
    profit,
    profitMargin: margin,
    status,
    summary: msgs.profitSummary(profit, margin, transactions, status),
  };
}

/* ── Suggestions ───────────────────────────────────────────────────── */
function buildSuggestions(products: Product[], lang: string): Suggestion[] {
  const msgs = MESSAGES[lang as LocaleType] ?? MESSAGES.en;
  const suggestions: Suggestion[] = [];

  // 1. Out-of-stock = direct lost sales
  const outOfStock = products.filter(p => p.stock === 0);
  if (outOfStock.length > 0) {
    suggestions.push({
      title:    msgs.s1Title(outOfStock.length),
      detail:   msgs.s1Detail(outOfStock.map(p => p.name).join(', ')),
      impact:   'high',
      category: 'stock',
    });
  }

  // 2. Low margin products — review pricing
  const lowMargin = products.filter(p => {
    const bench = CATEGORY_MARGIN[p.category] ?? CATEGORY_MARGIN.Default;
    return margin(p) < bench.min;
  });
  if (lowMargin.length > 0) {
    suggestions.push({
      title:    msgs.s2Title,
      detail:   msgs.s2Detail(lowMargin.map(p => p.name).join(', ')),
      impact:   'high',
      category: 'pricing',
    });
  }

  // 3. High margin products — promote them
  const highMargin = products.filter(p => {
    const bench = CATEGORY_MARGIN[p.category] ?? CATEGORY_MARGIN.Default;
    return margin(p) > bench.max && p.stock > p.minStock;
  });
  if (highMargin.length > 0) {
    suggestions.push({
      title:    msgs.s3Title,
      detail:   msgs.s3Detail(highMargin.map(p => p.name).join(', ')),
      impact:   'medium',
      category: 'marketing',
    });
  }

  // 4. Bulk buying suggestion for low stock categories
  const lowStockCats = [...new Set(
    products.filter(p => p.stock < p.minStock).map(p => p.category)
  )];
  if (lowStockCats.length > 0) {
    suggestions.push({
      title:    msgs.s4Title,
      detail:   msgs.s4Detail(lowStockCats.join(', ')),
      impact:   'medium',
      category: 'operations',
    });
  }

  // 5. Generic daily tip if few suggestions
  if (suggestions.length < 3) {
    suggestions.push({
      title:    msgs.s5Title,
      detail:   msgs.s5Detail,
      impact:   'low',
      category: 'marketing',
    });
  }

  return suggestions.slice(0, 4);
}

/* ── Main export ───────────────────────────────────────────────────── */
export function generateSmartInsights(
  products: Product[],
  district: string,
  locale: string,
  summary?: any
): InsightsData {
  const lang = locale === 'hi' ? 'hi' : locale === 'mr' ? 'mr' : 'en';
  return {
    priceRecommendations: buildPriceRecs(products, district, lang),
    stockAlerts:          buildStockAlerts(products, lang),
    profitAnalysis:       { yesterday: buildProfit(summary, lang) },
    suggestions:          buildSuggestions(products, lang),
    source:               'smart',
  };
}

/* ══════════════════════════════════════════════════════════════════════
   Multilingual message templates
══════════════════════════════════════════════════════════════════════ */
type LocaleType = keyof typeof MESSAGES;

const MESSAGES = {
  en: {
    priceUp:        (n: string, mp: number) => `Market price is ₹${mp}. You can increase your price slightly to earn more.`,
    priceDown:      (n: string, mp: number) => `Market price is ₹${mp}. Consider lowering your price to stay competitive.`,
    priceOk:        (n: string) => `Your price is well aligned with the local market.`,
    stockCritical:  (n: string) => `Out of stock! Reorder immediately to avoid losing customers.`,
    stockLow:       (n: string, s: number, m: number) => `Only ${s} units left, minimum is ${m}. Reorder soon.`,
    stockSoon:      (n: string) => `Stock is getting low. Place an order before it runs out.`,
    profitSummary:  (p: number, m: number, t: number, s: string) =>
      `Yesterday you made ₹${p.toLocaleString('en-IN')} ${s} across ${t} transactions with a ${m}% margin. ${m > 20 ? 'Excellent performance!' : m > 12 ? 'Good, aim for 20%+ margin.' : 'Margin is low — review your pricing or supplier costs.'}`,
    s1Title:  (n: number) => `${n} Product(s) Out of Stock`,
    s1Detail: (names: string) => `${names} are completely out of stock. Every day without stock means lost sales and unhappy customers. Reorder today.`,
    s2Title:  `Low Profit Margin — Review Pricing`,
    s2Detail: (names: string) => `${names} have margins below the healthy range for their category. Either negotiate better supplier prices or slightly increase selling price.`,
    s3Title:  `Promote High-Margin Products`,
    s3Detail: (names: string) => `${names} have excellent margins and good stock. Place them at the front counter or offer combos to boost overall profit.`,
    s4Title:  `Bulk Order Opportunity`,
    s4Detail: (cats: string) => `${cats} categories are running low. Order in bulk from your supplier to get better rates and avoid stockouts.`,
    s5Title:  `Offer Weekend Combo Deals`,
    s5Detail: `Bundle slow-moving products with fast sellers (e.g. oil + dal + salt). Combos increase average bill value and clear old stock faster.`,
  },
  hi: {
    priceUp:        (n: string, mp: number) => `बाजार भाव ₹${mp} है। थोड़ा बढ़ाकर अधिक लाभ कमाएं।`,
    priceDown:      (n: string, mp: number) => `बाजार भाव ₹${mp} है। प्रतिस्पर्धी रहने के लिए कीमत घटाएं।`,
    priceOk:        (n: string) => `आपकी कीमत स्थानीय बाजार से मेल खाती है।`,
    stockCritical:  (n: string) => `स्टॉक खत्म! तुरंत ऑर्डर करें, ग्राहक न खोएं।`,
    stockLow:       (n: string, s: number, m: number) => `केवल ${s} यूनिट बचे हैं, न्यूनतम ${m} होना चाहिए। जल्दी ऑर्डर करें।`,
    stockSoon:      (n: string) => `स्टॉक कम हो रहा है। जल्द ऑर्डर दें।`,
    profitSummary:  (p: number, m: number, t: number, s: string) =>
      `कल ${t} लेनदेन में ₹${p.toLocaleString('en-IN')} का ${s === 'profit' ? 'लाभ' : 'नुकसान'} हुआ, मार्जिन ${m}% रहा। ${m > 20 ? 'शानदार प्रदर्शन!' : m > 12 ? 'अच्छा है, 20% मार्जिन का लक्ष्य रखें।' : 'मार्जिन कम है — कीमतें या आपूर्तिकर्ता लागत देखें।'}`,
    s1Title:  (n: number) => `${n} उत्पाद स्टॉक में नहीं`,
    s1Detail: (names: string) => `${names} स्टॉक में नहीं हैं। हर दिन की देरी से बिक्री और ग्राहक दोनों खोते हैं। आज ऑर्डर करें।`,
    s2Title:  `कम मुनाफा — कीमत की समीक्षा करें`,
    s2Detail: (names: string) => `${names} का मार्जिन श्रेणी की तुलना में कम है। आपूर्तिकर्ता से बेहतर दर लें या बिक्री मूल्य बढ़ाएं।`,
    s3Title:  `अधिक मुनाफे वाले उत्पाद आगे रखें`,
    s3Detail: (names: string) => `${names} का मार्जिन अच्छा है। इन्हें काउंटर पर आगे रखें या कॉम्बो ऑफर करें।`,
    s4Title:  `थोक में ऑर्डर का मौका`,
    s4Detail: (cats: string) => `${cats} श्रेणियों का स्टॉक कम है। थोक में ऑर्डर करके बेहतर दाम पाएं।`,
    s5Title:  `वीकेंड कॉम्बो ऑफर दें`,
    s5Detail: `तेल + दाल + नमक जैसे कॉम्बो बनाएं। इससे औसत बिल बढ़ता है और पुराना स्टॉक भी जल्दी बिकता है।`,
  },
  mr: {
    priceUp:        (n: string, mp: number) => `बाजारभाव ₹${mp} आहे. किंमत थोडी वाढवून अधिक नफा मिळवा.`,
    priceDown:      (n: string, mp: number) => `बाजारभाव ₹${mp} आहे. स्पर्धात्मक राहण्यासाठी किंमत कमी करा.`,
    priceOk:        (n: string) => `तुमची किंमत स्थानिक बाजाराशी सुसंगत आहे.`,
    stockCritical:  (n: string) => `साठा संपला! लगेच ऑर्डर करा, ग्राहक गमावू नका.`,
    stockLow:       (n: string, s: number, m: number) => `फक्त ${s} नग शिल्लक, किमान ${m} असायला हवे. लवकर ऑर्डर करा.`,
    stockSoon:      (n: string) => `साठा कमी होत आहे. लवकर ऑर्डर द्या.`,
    profitSummary:  (p: number, m: number, t: number, s: string) =>
      `काल ${t} व्यवहारांत ₹${p.toLocaleString('en-IN')} चा ${s === 'profit' ? 'नफा' : 'तोटा'} झाला, मार्जिन ${m}% होते. ${m > 20 ? 'उत्कृष्ट कामगिरी!' : m > 12 ? 'चांगले आहे, 20%+ मार्जिनचे लक्ष्य ठेवा.' : 'मार्जिन कमी आहे — किंमती किंवा पुरवठादार खर्च तपासा.'}`,
    s1Title:  (n: number) => `${n} उत्पादने साठ्यात नाहीत`,
    s1Detail: (names: string) => `${names} साठ्यात नाहीत. प्रत्येक दिवसाच्या उशिराने विक्री व ग्राहक दोन्ही जातात. आजच ऑर्डर करा.`,
    s2Title:  `कमी नफा — किंमत तपासा`,
    s2Detail: (names: string) => `${names} चा मार्जिन श्रेणीपेक्षा कमी आहे. पुरवठादाराकडून चांगला दर घ्या किंवा विक्री किंमत वाढवा.`,
    s3Title:  `जास्त नफ्याची उत्पादने पुढे ठेवा`,
    s3Detail: (names: string) => `${names} चा मार्जिन उत्तम आहे. काउंटरवर पुढे ठेवा किंवा कॉम्बो ऑफर करा.`,
    s4Title:  `घाऊक ऑर्डरची संधी`,
    s4Detail: (cats: string) => `${cats} श्रेणींचा साठा कमी आहे. घाऊक ऑर्डर देऊन चांगला भाव मिळवा.`,
    s5Title:  `वीकेंड कॉम्बो ऑफर द्या`,
    s5Detail: `तेल + डाळ + मीठ असे कॉम्बो बनवा. यामुळे सरासरी बिल वाढते आणि जुना साठाही लवकर संपतो.`,
  },
};
