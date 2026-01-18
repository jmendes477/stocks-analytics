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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS fundamentals_latest (
        symbol TEXT PRIMARY KEY REFERENCES tickers(symbol),

        -- Valuation
        pe_ratio DOUBLE PRECISION,
        forward_pe DOUBLE PRECISION,
        pb_ratio DOUBLE PRECISION,
        ps_ratio DOUBLE PRECISION,
        ev_ebitda DOUBLE PRECISION,

        -- Profitability
        roe DOUBLE PRECISION,
        roic DOUBLE PRECISION,
        gross_margin DOUBLE PRECISION,
        operating_margin DOUBLE PRECISION,
        net_margin DOUBLE PRECISION,

        -- Growth (CAGR, %)
        revenue_growth_3y DOUBLE PRECISION,
        eps_growth_3y DOUBLE PRECISION,
        fcf_growth_3y DOUBLE PRECISION,

        -- Financial health
        debt_to_equity DOUBLE PRECISION,
        interest_coverage DOUBLE PRECISION,
        current_ratio DOUBLE PRECISION,

        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    console.log('✓ Created fundamentals_latest table');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS risk_metrics_latest (
        symbol TEXT PRIMARY KEY REFERENCES tickers(symbol),

        beta DOUBLE PRECISION,
        volatility_30d DOUBLE PRECISION,
        volatility_90d DOUBLE PRECISION,
        max_drawdown_1y DOUBLE PRECISION,
        sharpe_ratio_1y DOUBLE PRECISION,

        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    console.log('✓ Created risk_metrics_latest table');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS valuation_zscores_latest (
        symbol TEXT PRIMARY KEY REFERENCES tickers(symbol),

        pe_zscore DOUBLE PRECISION,
        pb_zscore DOUBLE PRECISION,
        ps_zscore DOUBLE PRECISION,
        ev_ebitda_zscore DOUBLE PRECISION,

        fcf_yield_zscore DOUBLE PRECISION,

        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    console.log('✓ Created valuation_zscores_latest table');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS composite_scores_latest (
        symbol TEXT PRIMARY KEY REFERENCES tickers(symbol),

        valuation_score DOUBLE PRECISION,
        profitability_score DOUBLE PRECISION,
        growth_score DOUBLE PRECISION,
        risk_score DOUBLE PRECISION,

        total_score DOUBLE PRECISION,

        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    console.log('✓ Created composite_scores_latest table');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_fundamentals_updated_at
      ON fundamentals_latest(updated_at DESC);
    `);
    console.log('✓ Created index on updated_at');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_zscores_pe
      ON valuation_zscores_latest(pe_zscore);
    `);
    console.log('✓ Created index on pe_zscore');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_composite_total
      ON composite_scores_latest(total_score DESC);
    `);
    console.log('✓ Created index on total_score');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS fundamentals_history (
        symbol TEXT REFERENCES tickers(symbol),
        as_of DATE NOT NULL,

        pe_ratio DOUBLE PRECISION,
        pb_ratio DOUBLE PRECISION,
        ps_ratio DOUBLE PRECISION,
        ev_ebitda DOUBLE PRECISION,

        revenue_growth_3y DOUBLE PRECISION,
        eps_growth_3y DOUBLE PRECISION,

        PRIMARY KEY (symbol, as_of)
      );
    `);
    console.log('✓ Created fundamentals_history table');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_fund_hist_date
      ON fundamentals_history(as_of);
    `);
    console.log('✓ Created index on as_of');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_fund_hist_symbol
      ON fundamentals_history(symbol);
    `);
    console.log('✓ Created index on pe_zscore');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS valuation_zscores_timeseries (
        symbol TEXT REFERENCES tickers(symbol),
        as_of DATE NOT NULL,

        pe_zscore_ts DOUBLE PRECISION,
        pb_zscore_ts DOUBLE PRECISION,
        ps_zscore_ts DOUBLE PRECISION,
        ev_ebitda_zscore_ts DOUBLE PRECISION,

        PRIMARY KEY (symbol, as_of)
      );
    `);
    console.log('✓ Created valuation_zscores_timeseries table');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_z_ts_symbol
      ON valuation_zscores_timeseries(symbol);
    `);
    console.log('✓ Created index on symbol in valuation_zscores_timeseries');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS valuation_metrics_timeseries (
        symbol TEXT NOT NULL,
        as_of DATE NOT NULL,
        price NUMERIC,
        eps_ttm NUMERIC,
        pe_ratio NUMERIC,
        source TEXT,
        created_at TIMESTAMP DEFAULT now(),
        PRIMARY KEY (symbol, as_of)
      );
    `);
    console.log('✓ Created valuation_metrics_timeseries table');

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
