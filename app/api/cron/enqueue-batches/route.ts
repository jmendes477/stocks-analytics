import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import fetch from 'node-fetch';


// Example: get tickers from DB and push batches into QStash (or store batch keys in Redis for QStash to pick up)
export async function GET() {
    // Here, you would query your DB for active tickers; as placeholder, we use a small list
    const tickers = ['AAPL', 'MSFT', 'TSLA', 'GOOG', 'AMZN'];
    const batchSize = 50;
    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        // Post to QStash endpoint that will forward to your worker route
        await fetch(process.env.QSTASH_PUBLISH_URL as string, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: 'process-batch', batch }),
        });
    }
    return NextResponse.json({ enqueued: true });
}