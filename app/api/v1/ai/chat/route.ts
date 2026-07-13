import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { aiComplete, LANG } from '@/lib/server/ai';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const { question, locale, screenContext } = await readBody(req);
  if (!question?.trim()) throw new ApiError(400, 'question is required');

  // ── Gather the shop's real data for grounding ──
  const products = await prisma.product.findMany({
    where: { shopId: shop.id },
    select: {
      id: true, name: true, category: true, currentStock: true, minStock: true,
      mrp: true, sellingPrice: true, wholesaleCost: true, baseUnit: true,
    },
    take: 400,
  });

  // Sales in the last 30 days → quantity sold + revenue per product
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const saleItems = await prisma.saleItem.findMany({
    where: { sale: { shopId: shop.id, createdAt: { gte: since } } },
    select: { productId: true, quantity: true, pricePerUnit: true, marginPerUnit: true },
  });
  const sold: Record<string, { qty: number; revenue: number; profit: number }> = {};
  for (const si of saleItems) {
    const k = si.productId || 'unknown';
    (sold[k] ||= { qty: 0, revenue: 0, profit: 0 });
    sold[k].qty += si.quantity || 0;
    sold[k].revenue += (si.pricePerUnit || 0) * (si.quantity || 0);
    sold[k].profit += (si.marginPerUnit || 0) * (si.quantity || 0);
  }

  const productLines = products.map((p) => {
    const s = sold[p.id] || { qty: 0, revenue: 0, profit: 0 };
    const margin = (p.sellingPrice || 0) - (p.wholesaleCost || 0);
    const marginPct = p.wholesaleCost ? Math.round((margin / p.wholesaleCost) * 100) : 0;
    return [
      `name=${p.name}`,
      p.category ? `category=${p.category}` : '',
      `wholesale_cost=₹${p.wholesaleCost ?? 0}`,
      `selling_price=₹${p.sellingPrice ?? 0}`,
      `mrp=₹${p.mrp ?? 0}`,
      `profit_per_unit=₹${margin} (${marginPct}%)`,
      `stock=${p.currentStock ?? 0}${p.baseUnit ? ' ' + p.baseUnit : ''}`,
      `sold_30d=${s.qty}`,
      `revenue_30d=₹${Math.round(s.revenue)}`,
    ].filter(Boolean).join(', ');
  }).join('\n');

  const lang = LANG[locale as string] || 'the same language as the question';

  // ── Screen-specific context injection ──
  const screenHints: Record<string, string> = {
    billing: 'The user is currently on the Billing/POS screen. Focus on billing, invoice creation, payment methods, and customer selection.',
    stock: 'The user is on the Stock/Inventory screen. Focus on stock levels, minimum stock, reorder, and product details.',
    purchases: 'The user is on the Purchases screen. Focus on supplier invoices, purchase costs, and stock inflow.',
    udhar: 'The user is on the Outstanding/Udhar screen. Focus on customer dues, payment collection, and ledger entries.',
    reports: 'The user is on the Reports screen. Focus on sales trends, profit analysis, and business performance.',
    expenses: 'The user is on the Expenses screen. Focus on expense categories, cash outflow, and cost management.',
    customers: 'The user is on the Customers screen. Focus on customer profiles, purchase history, and outstanding amounts.',
    suppliers: 'The user is on the Suppliers screen. Focus on supplier ledgers, payables, and purchase history.',
    products: 'The user is on the Products screen. Focus on product pricing, margin, stock, and catalog management.',
    dashboard: 'The user is on the Dashboard. Give a holistic business overview.',
  };

  const screenNote = screenContext
    ? (screenHints[screenContext] || `The user is currently on the "${screenContext}" screen.`)
    : '';

  const packageNote = `Package: ${shop.subscriptionPlan || 'basic'}. Business type: ${shop.businessType || 'retail'}.`;

  const systemPrompt = `You are "Vyapar Guru", a knowledgeable AI business advisor for an Indian shop owner using the Vyapar Sarthi ERP app.

${screenNote ? `CURRENT SCREEN CONTEXT: ${screenNote}\n` : ''}
${packageNote}

Understanding the question:
- Shop owners type in many mixed ways — pure English, pure Hindi/Marathi (Devanagari script), or Hinglish/Manglish (Hindi or Marathi words spelled out in Roman/English letters, e.g. "aaj kitna sale hua", "kiti udhar baki ahe", "stock kam hai kya"). They also often mix English business words (stock, profit, bill, customer, margin) into an otherwise Hindi/Marathi sentence, or type an English word but clearly mean its Hindi/Marathi sense in context.
- Always understand the INTENT regardless of script or language mixing — never say you don't understand just because the input isn't clean English.
- If a word is ambiguous, use the current screen context and shop data to infer the most likely meaning.

How to answer:
- If the question is about THIS shop's own products, prices, stock, profit or sales, use the SHOP DATA below. For a product the shop stocks, give its wholesale (buying) cost, selling price, MRP, and profit per unit.
- If the question is about the current screen, focus your answer on that domain specifically.
- If the question is about general/market topics NOT in the shop data — e.g. typical wholesale/market prices of a product, brand comparisons, what to stock, suppliers, margins, or business advice — answer from your general knowledge. Give a helpful approximate figure or a typical price range in ₹, then add a brief note that it is an estimate that varies by city, supplier, model and season, and suggest confirming with a local wholesaler.
- NEVER suggest modifying prices, deleting products, or creating bills without explicit user intent.
- Only say you don't know if you truly have no useful information.

Reply in ${lang} (the app's selected language), written in that language's normal/native script — not transliterated — regardless of what script or language mix the question was typed in. Be concise, practical and friendly. Use ₹ for money.

SHOP DATA —
Shop: ${shop.name || 'Shop'}${shop.businessType ? ` (${shop.businessType})` : ''}
Products (${products.length}):
${productLines || '(no products yet)'}`;

  const answer = await aiComplete(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question.trim() },
    ],
    // Headroom for the Nano reasoning model's "thinking" tokens before the answer.
    { maxTokens: 1200 },
  );
  return json({ answer });
});
