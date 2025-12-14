import yahooFinance from 'yahoo-finance2';
import { query } from '@/lib/db';
import { redis } from '@/lib/redis';
import { sma, ema, rsi } from '@/lib/indicators';

async function processTicker(symbol: string) {
  console.log('Processing', symbol);
  const history = await yahooFinance.historical(symbol, { period1: '2020-01-01', interval: '1d' })
    .catch(e => { console.error('yahoo error', e); return []; });

  if (!history || history.length === 0) return console.error('no history');

  const closes = history.map((h: any) => h.close).filter(Boolean);
  const indicators = {
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    ema12: ema(closes, 12),
    rsi14: rsi(closes, 14),
  };

  await query(`
    INSERT INTO analytics_latest (symbol, sma20, sma50, ema12, rsi14, updated_at)
    VALUES ($1,$2,$3,$4,$5,now())
    ON CONFLICT (symbol) DO UPDATE SET sma20 = $2, sma50 = $3, ema12 = $4, rsi14 = $5, updated_at = now()
  `, [symbol, indicators.sma20, indicators.sma50, indicators.ema12, indicators.rsi14]);

  try {
    await redis.set(`analytics:${symbol}`, JSON.stringify(indicators));
  } catch (e) {
    console.warn('redis set failed', e);
  }

  console.log('done', symbol);
}

const symbol = process.argv[2];
if (!symbol) {
  console.error('Usage: ts-node scripts/process-ticker.ts <SYMBOL>');
  process.exit(1);
}

processTicker(symbol).catch(e => { console.error(e); process.exit(1); });
