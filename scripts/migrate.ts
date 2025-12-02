import { createPool } from '@vercel/postgres';

async function up() {
    const pool = createPool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        console.log('Running migrations...');

        // Create tickers table
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

        // Create analytics_latest table
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

        // Create index for faster queries
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_analytics_updated_at 
            ON analytics_latest(updated_at DESC);
        `);
        console.log('✓ Created index on updated_at');

        console.log('✓ All migrations applied successfully');
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

up();