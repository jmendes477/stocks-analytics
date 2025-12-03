import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import { query } from '@/lib/db';
import { redis } from '@/lib/redis';
import { sma, ema, rsi } from '@/lib/indicators';
import { qstashMiddleware } from '@/lib/qstash';

export async function POST(req: Request) {
	// verify QStash signature (throws if invalid)
	await qstashMiddleware(req);
	const payload = await req.json();
	const { symbol } = payload;

	if (!symbol || typeof symbol !== 'string') {
		return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
	}

	// Fetch recent daily history
	const history = await yahooFinance.historical(symbol, { period1: '2020-01-01', interval: '1d' })
		.catch((e: any) => { console.error(e); return []; });

	if (!history || history.length === 0) return NextResponse.json({ ok: false });

	const closes = history.map((h: any) => h.close).filter(Boolean);
	const indicators = {
		sma20: sma(closes, 20),
		sma50: sma(closes, 50),
		ema12: ema(closes, 12),
		rsi14: rsi(closes, 14)
	};

	try {
		// Upsert into Postgres analytics_latest
		await query(`
			INSERT INTO analytics_latest (symbol, sma20, sma50, ema12, rsi14, updated_at)
			VALUES ($1,$2,$3,$4,$5,now())
			ON CONFLICT (symbol) DO UPDATE SET sma20 = $2, sma50 = $3, ema12 = $4, rsi14 = $5, updated_at = now()
		`, [symbol, indicators.sma20, indicators.sma50, indicators.ema12, indicators.rsi14]);

		// cache small object in Redis (30 min)
		try {
			await redis.set(`analytics:${symbol}`, JSON.stringify(indicators));
		} catch (e) {
			console.warn('Failed to cache analytics in Redis', e);
		}

		return NextResponse.json({ ok: true, symbol });
	} catch (err) {
		console.error('Error processing analytics:', err);
		return NextResponse.json({ error: 'internal' }, { status: 500 });
	}
}

export const runtime = 'edge';

