import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { query } from '@/lib/db';


export async function GET(req: Request, { params }: { params: { symbol: string } }) {
    const { symbol } = params || {};

    if (!symbol || typeof symbol !== 'string') {
        return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
    }

    try {
        // Try cache first
        const cached = await redis.get(`analytics:${symbol}`);
        if (cached) {
            // Redis client can return unknown; ensure we only call JSON.parse on strings
            if (typeof cached === 'string') {
                try {
                    const parsed = JSON.parse(cached);
                    return NextResponse.json(parsed);
                } catch (e) {
                    // If cached value is corrupt, fallthrough to DB
                    console.warn('Failed to parse cached analytics for', symbol, e);
                }
            } else {
                // If the client already returned a parsed object, return it directly
                return NextResponse.json(cached as any);
            }
        }

        // Fallback to DB
        const res = await query('SELECT * FROM analytics_latest WHERE symbol = $1', [symbol]);
        const row = res?.rows?.[0] || null;
        if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        return NextResponse.json(row);
    } catch (err) {
        console.error('Error in GET /api/stocks/[symbol]:', err);
        return NextResponse.json({ error: 'internal' }, { status: 500 });
    }
}