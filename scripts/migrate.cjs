// Load local .env.local (if present) so migrations work without exporting env vars manually
try { require('dotenv').config({ path: '.env.local' }); } catch (e) { /* noop if dotenv not installed */ }
const { createPool } = require('@vercel/postgres');

async function up() {
  const pool = createPool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

  try {
    console.log('Running migrations...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickers (
        symbol TEXT PRIMARY KEY,
        name TEXT,
        exchange TEXT,
        currency TEXT,
        region TEXT,
        active BOOLEAN DEFAULT true,
        first_seen TIMESTAMP DEFAULT now(),
        last_seen TIMESTAMP
      );
    `);
    console.log('✓ Created tickers table');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics_latest (
        symbol TEXT PRIMARY KEY,
        sma20 DOUBLE PRECISION,
        sma50 DOUBLE PRECISION,
        ema12 DOUBLE PRECISION,
        rsi14 DOUBLE PRECISION,
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    console.log('✓ Created analytics_latest table');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_updated_at 
      ON analytics_latest(updated_at DESC);
    `);
    console.log('✓ Created index on updated_at');

    console.log('✓ All migrations applied successfully');
  } catch (error) {
    console.error('Migration error:', error);
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch (e) { /* ignore */ }
  }
}

if (require.main === module) {
  up().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
