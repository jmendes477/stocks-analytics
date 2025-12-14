// CommonJS version for running without ts-node
try { require('dotenv').config({ path: '.env.local' }); } catch (e) { /* noop */ }
const { createPool } = require('@vercel/postgres');
const Yahoo = require('yahoo-finance2');
const { Redis } = require('@upstash/redis');

function sma(values, period) {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

function ema(values, period) {
  if (!values || values.length < period) return null;
  const k = 2 / (period + 1);
  let emaPrev = values[values.length - period];
  for (let i = values.length - period + 1; i < values.length; i++) {
    emaPrev = values[i] * k + emaPrev * (1 - k);
  }
  return emaPrev;
}

function rsi(values, period = 14) {
  if (!values || values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

async function processTicker(symbol) {
  if (!symbol) {
    console.error('Usage: node scripts/process-ticker.cjs <SYMBOL>');
    process.exit(1);
  }

  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!conn) {
    console.error('DATABASE_URL or POSTGRES_URL is required in environment');
    process.exit(1);
  }

  const pool = createPool({ connectionString: conn });

  try {
    const yahoo = Yahoo.default || Yahoo;
    const history = await yahoo.historical(symbol, { period1: '2020-01-01', interval: '1d' })
      .catch(e => { console.error('yahoo error', e); return []; });

    if (!history || history.length === 0) return console.error('no history for', symbol);

    const closes = history.map(h => h.close).filter(Boolean);
    const indicators = {
      sma20: sma(closes, 20),
      sma50: sma(closes, 50),
      ema12: ema(closes, 12),
      rsi14: rsi(closes, 14),
    };

    await pool.query(`
      INSERT INTO analytics_latest (symbol, sma20, sma50, ema12, rsi14, updated_at)
      VALUES ($1,$2,$3,$4,$5,now())
      ON CONFLICT (symbol) DO UPDATE SET sma20 = $2, sma50 = $3, ema12 = $4, rsi14 = $5, updated_at = now()
    `, [symbol, indicators.sma20, indicators.sma50, indicators.ema12, indicators.rsi14]);

    // Redis (Upstash) optional
    let redis = null;
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      try {
        redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
        await redis.set(`analytics:${symbol}`, JSON.stringify(indicators));
      } catch (e) {
        console.warn('redis set failed', e);
      }
    }

    console.log('Processed', symbol, indicators);
  } catch (e) {
    console.error('process-ticker error', e);
    process.exit(1);
  } finally {
    try { await pool.end(); } catch (e) { /* ignore */ }
  }
}

const symbol = process.argv[2];
processTicker(symbol);
