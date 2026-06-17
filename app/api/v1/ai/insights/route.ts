import prisma from '@/lib/server/prisma';
import { requireShop } from '@/lib/server/auth';
import { aiComplete, LANG } from '@/lib/server/ai';
import { startOfDay, endOfDay } from '@/lib/server/dates';
import { handle, json, readBody } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  const { locale } = await readBody(req);
  const lang = LANG[locale as string] || 'English';
  const shopId = shop.id;

  const now = new Date();
  const yStart = startOfDay(new Date(now.getTime() - 86400000));
  const yEnd = endOfDay(new Date(now.getTime() - 86400000));
  const dbStart = startOfDay(new Date(now.getTime() - 2 * 86400000));
  const dbEnd = endOfDay(new Date(now.getTime() - 2 * 86400000));
  const since30 = new Date(now.getTime() - 30 * 86400000);

  const [yAgg, dbAgg, products, saleItems] = await Promise.all([
    prisma.sale.aggregate({
      where: { shopId, createdAt: { gte: yStart, lte: yEnd } },
      _sum: { totalAmount: true, totalProfit: true }, _count: { _all: true },
    }),
    prisma.sale.aggregate({
      where: { shopId, createdAt: { gte: dbStart, lte: dbEnd } },
      _sum: { totalAmount: true, totalProfit: true }, _count: { _all: true },
    }),
    prisma.product.findMany({
      where: { shopId },
      select: { id: true, name: true, currentStock: true, minStock: true, sellingPrice: true, wholesaleCost: true },
      take: 500,
    }),
    prisma.saleItem.findMany({
      where: { sale: { shopId, createdAt: { gte: since30 } } },
      select: { productId: true, quantity: true, pricePerUnit: true },
    }),
  ]);

  const sold: Record<string, { qty: number; revenue: number }> = {};
  for (const si of saleItems) {
    const k = si.productId || 'x';
    (sold[k] ||= { qty: 0, revenue: 0 });
    sold[k].qty += si.quantity || 0;
    sold[k].revenue += (si.pricePerUnit || 0) * (si.quantity || 0);
  }

  const enriched = products.map((p) => {
    const s = sold[p.id] || { qty: 0, revenue: 0 };
    const margin = (p.sellingPrice || 0) - (p.wholesaleCost || 0);
    const marginPct = p.wholesaleCost ? Math.round((margin / p.wholesaleCost) * 100) : 0;
    return { ...p, qty30: s.qty, rev30: s.revenue, margin, marginPct };
  });

  const topSellers = [...enriched].filter((p) => p.rev30 > 0).sort((a, b) => b.rev30 - a.rev30).slice(0, 5);
  const restock = enriched.filter((p) => p.qty30 > 0 && (p.currentStock ?? 0) <= (p.minStock ?? 0)).sort((a, b) => b.rev30 - a.rev30).slice(0, 6);
  const slowMovers = enriched.filter((p) => (p.currentStock ?? 0) > 0 && p.qty30 === 0)
    .sort((a, b) => (b.currentStock ?? 0) * (b.sellingPrice ?? 0) - (a.currentStock ?? 0) * (a.sellingPrice ?? 0)).slice(0, 6);
  const lowMargin = enriched.filter((p) => p.wholesaleCost && p.marginPct < 10).sort((a, b) => a.marginPct - b.marginPct).slice(0, 6);

  const yS = yAgg._sum.totalAmount || 0, yP = yAgg._sum.totalProfit || 0, yB = yAgg._count._all;
  const dbS = dbAgg._sum.totalAmount || 0, dbP = dbAgg._sum.totalProfit || 0, dbB = dbAgg._count._all;

  const data = `Shop: ${shop.name || 'Shop'}${shop.businessType ? ` (type: ${shop.businessType})` : ''}
Yesterday: sales ${inr(yS)}, profit ${inr(yP)}, bills ${yB}
Day before: sales ${inr(dbS)}, profit ${inr(dbP)}, bills ${dbB}
Top sellers (30d): ${topSellers.map((p) => `${p.name} (${inr(p.rev30)})`).join(', ') || 'none'}
Bestsellers now out-of-stock / low (need restock): ${restock.map((p) => `${p.name} (stock ${p.currentStock})`).join(', ') || 'none'}
Slow-moving stock (no sales in 30d): ${slowMovers.map((p) => `${p.name} (${p.currentStock} units)`).join(', ') || 'none'}
Low-margin items: ${lowMargin.map((p) => `${p.name} (${p.marginPct}%)`).join(', ') || 'none'}`;

  const systemPrompt = `You are "Vyapar Guru", a smart, friendly business advisor for an Indian shopkeeper.
Using ONLY the data provided, write a short DAILY BUSINESS REPORT in ${lang}. Use ₹ for money.
Structure it with these sections (each a heading with an emoji, then 1-2 short bullet points):
📈 Yesterday — sales & profit vs the day before, and the most likely REASON for the change (use bill count, stockouts of bestsellers, or low-margin mix to explain).
🔁 Restock now — bestsellers that are out of stock or low.
🧊 Clear slow stock — items not selling; suggest a small discount/combo offer.
💰 Margin tip — low-margin items to review pricing on.
✅ Today's #1 action — one concrete, specific suggestion.
Keep it under 180 words, practical and encouraging. If a section has no data, skip it.`;

  const report = await aiComplete(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Here is my shop data:\n${data}\n\nGive me today's business report.` },
    ],
    // Generous budget: the Nano model is a reasoning model and can spend
    // several hundred "thinking" tokens before the visible report.
    { maxTokens: 1500 },
  );

  return json({ report });
});
