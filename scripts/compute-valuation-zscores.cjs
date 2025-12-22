try { require('dotenv').config({ path: '.env.local' }); } catch (e) { /* noop */ }

const { createPool } = require('@vercel/postgres');

/**
 * Compares stocks vs stocks
 * Compute mean and std dev
 */
function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values, avg) {
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function zscore(value, avg, sd) {
  if (sd === 0 || value === null) return null;
  return (value - avg) / sd;
}

async function computeZScores() {
  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!conn) {
    console.error('DATABASE_URL or POSTGRES_URL is required');
    process.exit(1);
  }

  const pool = createPool({ connectionString: conn });

  try {
    console.log('Computing valuation Z-scores...');

    // ---- Load all fundamentals
    const { rows } = await pool.query(`
      SELECT
        symbol,
        pe_ratio,
        pb_ratio,
        ps_ratio,
        ev_ebitda
      FROM fundamentals_latest
      WHERE pe_ratio IS NOT NULL
         OR pb_ratio IS NOT NULL
         OR ps_ratio IS NOT NULL
         OR ev_ebitda IS NOT NULL
    `);

    if (rows.length < 10) {
      console.warn('Not enough data to compute Z-scores');
      return;
    }

    // ---- Collect arrays per metric
    const pe = rows.map(r => r.pe_ratio).filter(v => v > 0);
    const pb = rows.map(r => r.pb_ratio).filter(v => v > 0);
    const ps = rows.map(r => r.ps_ratio).filter(v => v > 0);
    const ev = rows.map(r => r.ev_ebitda).filter(v => v > 0);

    const stats = {
      pe: pe.length ? { avg: mean(pe), sd: stddev(pe, mean(pe)) } : null,
      pb: pb.length ? { avg: mean(pb), sd: stddev(pb, mean(pb)) } : null,
      ps: ps.length ? { avg: mean(ps), sd: stddev(ps, mean(ps)) } : null,
      ev: ev.length ? { avg: mean(ev), sd: stddev(ev, mean(ev)) } : null
    };

    // ---- Insert/update Z-scores
    for (const r of rows) {
      const pe_z = stats.pe ? zscore(r.pe_ratio, stats.pe.avg, stats.pe.sd) : null;
      const pb_z = stats.pb ? zscore(r.pb_ratio, stats.pb.avg, stats.pb.sd) : null;
      const ps_z = stats.ps ? zscore(r.ps_ratio, stats.ps.avg, stats.ps.sd) : null;
      const ev_z = stats.ev ? zscore(r.ev_ebitda, stats.ev.avg, stats.ev.sd) : null;

      await pool.query(`
        INSERT INTO valuation_zscores_latest (
          symbol,
          pe_zscore,
          pb_zscore,
          ps_zscore,
          ev_ebitda_zscore,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,now())
        ON CONFLICT (symbol) DO UPDATE SET
          pe_zscore = $2,
          pb_zscore = $3,
          ps_zscore = $4,
          ev_ebitda_zscore = $5,
          updated_at = now()
      `, [
        r.symbol,
        pe_z,
        pb_z,
        ps_z,
        ev_z
      ]);
    }

    console.log('✓ Z-scores computed for', rows.length, 'stocks');

    // ---- Log global stats (debug)
    console.log('Global valuation stats:', {
      pe: stats.pe,
      pb: stats.pb,
      ps: stats.ps,
      ev_ebitda: stats.ev
    });

  } catch (e) {
    console.error('compute-valuation-zscores error', e);
    process.exit(1);
  } finally {
    try { await pool.end(); } catch (e) { /* ignore */ }
  }
}

computeZScores();
