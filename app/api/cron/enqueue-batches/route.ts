import { NextResponse } from 'next/server';


// Example: get tickers from DB and push batches into QStash (or store batch keys in Redis for QStash to pick up)
export async function GET(req: Request) {
    // Verify it's from Vercel Cron
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Here, you would query your DB for active tickers; as placeholder, we use a small list
    const tickers = ['AAPL', 'MSFT', 'TSLA', 'GOOG', 'AMZN'];
    const batchSize = 50;
    if (!process.env.QSTASH_PUBLISH_URL) {
        return NextResponse.json({ error: 'QSTASH_PUBLISH_URL not configured' }, { status: 500 });
    }

    try {
        for (let i = 0; i < tickers.length; i += batchSize) {
            const batch = tickers.slice(i, i + batchSize);
            // Post to QStash endpoint that will forward to your worker route
            const res = await fetch(process.env.QSTASH_PUBLISH_URL as string, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: 'process-batch', batch }),
            });
            if (!res.ok) {
                console.error('Failed to publish to QStash', await res.text());
            }
        }
        return NextResponse.json({ enqueued: true });
    } catch (err) {
        console.error('enqueue-batches error:', err);
        return NextResponse.json({ error: 'internal' }, { status: 500 });
    }
}

export const maxDuration = 60;