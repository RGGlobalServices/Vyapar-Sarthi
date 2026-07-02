import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear, format, parseISO, subDays, subMonths, subYears } from 'date-fns';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const shopId = req.headers.get('x-shop-id');
    if (!shopId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const timeframe = searchParams.get('timeframe') || 'month'; // day, week, month, quarter, year
    const startParam = searchParams.get('startDate');
    const endParam = searchParams.get('endDate');
    
    // Default range depending on timeframe
    let startDate = new Date();
    if (startParam) {
      startDate = parseISO(startParam);
    } else {
      if (timeframe === 'day') startDate = subDays(new Date(), 30);
      else if (timeframe === 'week') startDate = subMonths(new Date(), 6);
      else if (timeframe === 'month') startDate = subYears(new Date(), 2);
      else if (timeframe === 'quarter') startDate = subYears(new Date(), 3);
      else startDate = subYears(new Date(), 5);
    }

    const whereClause: any = { shopId };
    
    if (startParam && endParam) {
      whereClause.createdAt = { gte: startDate, lte: parseISO(endParam) };
    } else {
      whereClause.createdAt = { gte: startDate };
    }

    const sales = await prisma.sale.findMany({
      where: whereClause,
      include: {
        items: {
          include: {
            product: { select: { name: true, category: true } }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Aggregations
    const trendsMap = new Map<string, { date: string, sales: number, profit: number, qty: number }>();
    const productMap = new Map<string, { id: string, name: string, category: string, qty: number, revenue: number, profit: number }>();

    sales.forEach(sale => {
      if (!sale.createdAt) return;
      const d = new Date(sale.createdAt);
      let key = '';
      
      if (timeframe === 'day') key = format(d, 'yyyy-MM-dd');
      else if (timeframe === 'week') key = format(startOfWeek(d), 'yyyy-MM-dd');
      else if (timeframe === 'month') key = format(d, 'MMM yyyy');
      else if (timeframe === 'quarter') key = `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}`;
      else if (timeframe === 'year') key = format(d, 'yyyy');

      const current = trendsMap.get(key) || { date: key, sales: 0, profit: 0, qty: 0 };
      current.sales += sale.totalAmount || 0;
      current.profit += sale.totalProfit || 0;
      
      sale.items.forEach(item => {
        current.qty += item.quantity || 0;

        const prodId = item.productId || 'unknown';
        const prodName = item.product?.name || 'Unknown Product';
        const prodCat = item.product?.category || 'Uncategorized';
        
        const pCurrent = productMap.get(prodId) || { id: prodId, name: prodName, category: prodCat, qty: 0, revenue: 0, profit: 0 };
        pCurrent.qty += item.quantity || 0;
        pCurrent.revenue += (item.quantity || 0) * (item.pricePerUnit || 0);
        pCurrent.profit += (item.quantity || 0) * (item.marginPerUnit || 0);
        
        productMap.set(prodId, pCurrent);
      });

      trendsMap.set(key, current);
    });

    const trend = Array.from(trendsMap.values());
    const productsBreakdown = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue); // Sort by highest revenue

    return NextResponse.json({ trend, productsBreakdown });

  } catch (error: any) {
    console.error('Sales history API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
