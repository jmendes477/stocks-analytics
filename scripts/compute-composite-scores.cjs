try { require('dotenv').config({ path: '.env.local' }); } catch (e) { /* noop */ }

const { createPool } = require('@vercel/postgres');

async function computeCompositeScores() {
  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!conn) {
    console.error('DATABASE_URL or POSTGRES_URL is required');
    process.exit(1);
  }

  // Component weights (can be overridden via env vars)
  const VAL_PE_W = Number(process.env.VAL_PE_W ?? 1);
  const VAL_PB_W = Number(process.env.VAL_PB_W ?? 1);
  const VAL_PS_W = Number(process.env.VAL_PS_W ?? 1);
  const VAL_EV_W = Number(process.env.VAL_EV_W ?? 1);

  const GROWTH_REV_W = Number(process.env.GROWTH_REV_W ?? 0.6);
  const GROWTH_EPS_W = Number(process.env.GROWTH_EPS_W ?? 0.4);

  const COMP_W_VAL = Number(process.env.COMP_W_VAL ?? 0.4);
  const COMP_W_PROF = Number(process.env.COMP_W_PROF ?? 0.3);
  const COMP_W_GROW = Number(process.env.COMP_W_GROW ?? 0.2);
  const COMP_W_RISK = Number(process.env.COMP_W_RISK ?? 0.1);

  const pool = createPool({ connectionString: conn });

  try {
    console.log('Computing composite scores with weights:');
    console.log({ VAL_PE_W, VAL_PB_W, VAL_PS_W, VAL_EV_W, GROWTH_REV_W, GROWTH_EPS_W, COMP_W_VAL, COMP_W_PROF, COMP_W_GROW, COMP_W_RISK });

    const sql = `
WITH computed AS (
  SELECT t.symbol,
    -- Valuation score: weighted average of available inverted z-scores (lower z is better)
    CASE WHEN (
      (v.pe_zscore IS NOT NULL)::int + (v.pb_zscore IS NOT NULL)::int + (v.ps_zscore IS NOT NULL)::int + (v.ev_ebitda_zscore IS NOT NULL)::int
    ) = 0 THEN 0
    ELSE (
      COALESCE(-v.pe_zscore,0) * $1 +
      COALESCE(-v.pb_zscore,0) * $2 +
      COALESCE(-v.ps_zscore,0) * $3 +
      COALESCE(-v.ev_ebitda_zscore,0) * $4
    ) / NULLIF(
      (CASE WHEN v.pe_zscore IS NOT NULL THEN $1 ELSE 0 END) +
      (CASE WHEN v.pb_zscore IS NOT NULL THEN $2 ELSE 0 END) +
      (CASE WHEN v.ps_zscore IS NOT NULL THEN $3 ELSE 0 END) +
      (CASE WHEN v.ev_ebitda_zscore IS NOT NULL THEN $4 ELSE 0 END), 0
    ) END AS valuation_score,

    -- Profitability: normalize roe (%) into [-1,1]
    LEAST(GREATEST(COALESCE(f.roe/100.0, 0), -1.0), 1.0) AS profitability_score,

    -- Growth: weighted average of revenue and eps growth, clamped to [-1,1]
    LEAST(GREATEST(
      CASE WHEN ((f.revenue_growth_3y IS NOT NULL)::int + (f.eps_growth_3y IS NOT NULL)::int) = 0 THEN 0
      ELSE (
        COALESCE(f.revenue_growth_3y,0) * $5 + COALESCE(f.eps_growth_3y,0) * $6
      ) / NULLIF(
        (CASE WHEN f.revenue_growth_3y IS NOT NULL THEN $5 ELSE 0 END) + (CASE WHEN f.eps_growth_3y IS NOT NULL THEN $6 ELSE 0 END), 0
      ) END, -1.0), 1.0) AS growth_score,

    -- Risk: lower beta is better -> invert and scale (clamped)
    LEAST(GREATEST(COALESCE(-r.beta/10.0, 0), -1.0), 1.0) AS risk_score

  FROM tickers t
  LEFT JOIN valuation_zscores_latest v ON v.symbol = t.symbol
  LEFT JOIN fundamentals_latest f ON f.symbol = t.symbol
  LEFT JOIN risk_metrics_latest r ON r.symbol = t.symbol
)

, scores AS (
  SELECT
    symbol,
    valuation_score,
    profitability_score,
    growth_score,
    risk_score,
    (valuation_score * $7 + profitability_score * $8 + growth_score * $9 + risk_score * $10) AS total_score
  FROM computed
)

INSERT INTO composite_scores_latest (
  symbol, valuation_score, profitability_score, growth_score, risk_score, total_score, updated_at
)
SELECT symbol, valuation_score, profitability_score, growth_score, risk_score, total_score, now()
FROM scores
ON CONFLICT (symbol) DO UPDATE SET
  valuation_score = EXCLUDED.valuation_score,
  profitability_score = EXCLUDED.profitability_score,
  growth_score = EXCLUDED.growth_score,
  risk_score = EXCLUDED.risk_score,
  total_score = EXCLUDED.total_score,
  updated_at = now()
RETURNING symbol;
`;

    const params = [
      VAL_PE_W,
      VAL_PB_W,
      VAL_PS_W,
      VAL_EV_W,
      GROWTH_REV_W,
      GROWTH_EPS_W,
      COMP_W_VAL,
      COMP_W_PROF,
      COMP_W_GROW,
      COMP_W_RISK
    ];

    const res = await pool.query(sql, params);
    console.log('Composite scores upserted for', res.rowCount, 'symbols');
  } catch (e) {
    console.error('compute-composite-scores error', e);
    process.exit(1);
  } finally {
    try { await pool.end(); } catch (e) { /* ignore */ }
  }
}

computeCompositeScores();
