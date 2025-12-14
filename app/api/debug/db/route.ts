import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
  const secret = req.headers.get('x-admin-secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    // Check if analytics_latest exists and return a simple count
    const res = await query('SELECT COUNT(*)::int AS cnt FROM analytics_latest');
    const cnt = res?.rows?.[0]?.cnt ?? null;
    return NextResponse.json({ ok: true, analytics_count: cnt });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
