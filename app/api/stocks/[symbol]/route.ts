import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { query } from '@/lib/db';


export async function GET(req: Request, { params }: { params: { symbol: string } }) {
    const { symbol } = params;
    const cached = await redis.get(`analytics:${symbol}`);
    if (cached) return NextResponse.json(JSON.parse(cached));


    const res = await query('SELECT * FROM analytics_latest WHERE symbol = $1', [symbol]);
    const row = res?.rows?.[0] || null;
    return NextResponse.json(row);
}