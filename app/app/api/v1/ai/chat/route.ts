import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { aiComplete, LANG } from '@/lib/server/ai';
import { handle, json, readBody, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const { question, locale } = await readBody(req);
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

  const systemPrompt = `You are "Vyapar Guru", a knowledgeable AI business advisor for an Indian shop owner. You help with their own shop AND general business/market knowledge.

How to answer:
- If the question is about THIS shop's own products, prices, stock, profit or sales, use the SHOP DATA below. For a product the shop stocks, give its wholesale (buying) cost, selling price, MRP, and profit per unit.
- If the question is about general/market topics NOT in the shop data — e.g. typical wholesale/market prices of a product, brand comparisons, what to stock, suppliers, margins, or business advice — answer from your general knowledge. Give a helpful approximate figure or a typical price range in ₹, then add a brief note that it is an estimate that varies by city, supplier, model and season, and suggest confirming with a local wholesaler. Do NOT refuse just because it is not in the shop data.
- Only say you don't know if you truly have no useful information.

Reply in ${lang}. Be concise, practical and friendly. Use ₹ for money.

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
