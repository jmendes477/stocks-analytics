// CommonJS version
try { require('dotenv').config({ path: '.env.local' }); } catch (e) { /* noop */ }

// Ensure a global fetch is available (yahoo-finance2 expects it)
try {
  if (typeof fetch === 'undefined') {
    // use undici's fetch (already a dependency) when running under Node without global fetch
    // CommonJS require works for undici
    const { fetch: undiciFetch } = require('undici');
    global.fetch = undiciFetch;
  }
} catch (e) { /* ignore */ }

const { createPool } = require('@vercel/postgres');
const Yahoo = require('yahoo-finance2');

async function processFundamentals(symbol) {
  if (!symbol) {
    console.error('Usage: node scripts/process-fundamentals.cjs <SYMBOL>');
    process.exit(1);
  }

  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!conn) {
    console.error('DATABASE_URL or POSTGRES_URL is required');
    process.exit(1);
  }

  const pool = createPool({ connectionString: conn });

  try {
    const yahoo = Yahoo.default || Yahoo;

    // ---- Fetch modules in ONE request (important for rate limits)
    const quote = await yahoo.quoteSummary(symbol, {
      modules: [
        'price',
        'defaultKeyStatistics',
        'financialData',
        'summaryDetail',
        'incomeStatementHistory'
      ]
    });

    if (!quote) {
      console.error('No data for', symbol);
      return;
    }

    const stats = quote.defaultKeyStatistics || {};
    const fin = quote.financialData || {};
    const summary = quote.summaryDetail || {};
    const income = quote.incomeStatementHistory?.incomeStatementHistory || [];

    // ---- Valuation
    const pe_ratio = summary.trailingPE ?? null;
    const forward_pe = summary.forwardPE ?? null;
    const pb_ratio = summary.priceToBook ?? null;
    const ev_ebitda = stats.enterpriseToEbitda ?? null;
    const ps_ratio = summary.priceToSalesTrailing12Months ?? null;

    // ---- Profitability
    const roe = stats.returnOnEquity ?? null;
    const gross_margin = fin.grossMargins ?? null;
    const operating_margin = fin.operatingMargins ?? null;
    const net_margin = fin.profitMargins ?? null;

    // ---- Growth (approx from income statements)
    let revenue_growth_3y = null;
    let eps_growth_3y = null;

    if (income.length >= 4) {
      const revNow = income[0]?.totalRevenue;
      const revPast = income[3]?.totalRevenue;
      if (revNow && revPast) {
        revenue_growth_3y = Math.pow(revNow / revPast, 1 / 3) - 1;
      }

      const epsNow = income[0]?.dilutedEPS;
      const epsPast = income[3]?.dilutedEPS;
      if (epsNow && epsPast && epsPast !== 0) {
        eps_growth_3y = Math.pow(epsNow / epsPast, 1 / 3) - 1;
      }
    }

    // ---- Financial health
    const debt_to_equity = stats.debtToEquity ?? null;
    const current_ratio = fin.currentRatio ?? null;
    const interest_coverage = fin.ebitda && fin.interestExpense
      ? fin.ebitda / Math.abs(fin.interestExpense)
      : null;

    // ---- Risk
    const beta = stats.beta ?? null;

    // ---- Write fundamentals
    await pool.query(`
      INSERT INTO fundamentals_latest (
        symbol,
        pe_ratio, forward_pe, pb_ratio, ps_ratio, ev_ebitda,
        roe, gross_margin, operating_margin, net_margin,
        revenue_growth_3y, eps_growth_3y,
        debt_to_equity, interest_coverage, current_ratio,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,
        $11,$12,
        $13,$14,$15,
        now()
      )
      ON CONFLICT (symbol) DO UPDATE SET
        pe_ratio = $2,
        forward_pe = $3,
        pb_ratio = $4,
        ps_ratio = $5,
        ev_ebitda = $6,
        roe = $7,
        gross_margin = $8,
        operating_margin = $9,
        net_margin = $10,
        revenue_growth_3y = $11,
        eps_growth_3y = $12,
        debt_to_equity = $13,
        interest_coverage = $14,
        current_ratio = $15,
        updated_at = now()
    `, [
      symbol,
      pe_ratio, forward_pe, pb_ratio, ps_ratio, ev_ebitda,
      roe, gross_margin, operating_margin, net_margin,
      revenue_growth_3y, eps_growth_3y,
      debt_to_equity, interest_coverage, current_ratio
    ]);

    // ---- Write fundamentals history
    await pool.query(`
        INSERT INTO fundamentals_history (
            symbol, as_of,
            pe_ratio, pb_ratio, ps_ratio, ev_ebitda,
            revenue_growth_3y, eps_growth_3y
        )
        VALUES (
            $1, CURRENT_DATE,
            $2,$3,$4,$5,
            $6,$7
        )
        ON CONFLICT (symbol, as_of) DO NOTHING
        `, [
        symbol,
        pe_ratio,
        pb_ratio,
        ps_ratio,
        ev_ebitda,
        revenue_growth_3y,
        eps_growth_3y
    ]);


    // ---- Write risk metrics
    await pool.query(`
      INSERT INTO risk_metrics_latest (
        symbol, beta, updated_at
      )
      VALUES ($1,$2,now())
      ON CONFLICT (symbol) DO UPDATE SET
        beta = $2,
        updated_at = now()
    `, [symbol, beta]);

    console.log('Processed fundamentals', symbol, {
      pe_ratio,
      forward_pe,
      roe,
      revenue_growth_3y,
      beta
    });

  } catch (e) {
    console.error('process-fundamentals error', e);
    process.exit(1);
  } finally {
    try { await pool.end(); } catch (e) { /* ignore */ }
  }
}

const symbol = process.argv[2];
processFundamentals(symbol);
