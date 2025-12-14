import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = url.searchParams.get('ticker');
  if (!ticker) return NextResponse.json({ error: 'missing ticker' }, { status: 400 });

  try {
    // Request multiple modules to get price, EPS, shares outstanding, and PE when available
    const data: any = await yahooFinance.quoteSummary(ticker, {
      modules: ['price', 'defaultKeyStatistics', 'summaryDetail'],
    });

    const price = data?.price || {};
    const stats = data?.defaultKeyStatistics || {};
    const summary = data?.summaryDetail || {};

    const regularMarketPrice = price?.regularMarketPrice ?? price?.open ?? null;
    const epsTrailingTwelveMonths = stats?.trailingEps ?? null;
    const trailingPE = summary?.trailingPE ?? null;
    const sharesOutstanding = stats?.sharesOutstanding ?? null;

    const body = [
      {
        epsTrailingTwelveMonths: epsTrailingTwelveMonths?.raw ?? epsTrailingTwelveMonths ?? null,
        trailingPE: trailingPE?.raw ?? trailingPE ?? null,
        sharesOutstanding: sharesOutstanding?.raw ?? sharesOutstanding ?? null,
        regularMarketPrice: regularMarketPrice?.raw ?? regularMarketPrice ?? null,
      },
    ];

    return NextResponse.json({ body });
  } catch (err) {
    console.error('yahoo proxy error', err);
    return NextResponse.json({ error: 'failed to fetch ticker' }, { status: 500 });
  }
}
