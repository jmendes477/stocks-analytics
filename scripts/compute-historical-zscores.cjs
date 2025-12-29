try { require('dotenv').config({ path: '.env.local' }); } catch (e) {}

const { createPool } = require('@vercel/postgres');

function mean(v) {
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function stddev(v, avg) {
  return Math.sqrt(v.reduce((s, x) => s + (x - avg) ** 2, 0) / v.length);
}

function zscore(x, avg, sd) {
  if (sd === 0 || x === null) return null;
  return (x - avg) / sd;
}

async function computeHistoricalZScores() {
  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!conn) process.exit(1);

  const pool = createPool({ connectionString: conn });

  try {
    console.log('Computing historical Z-scores per stock...');
    console.time('historical_zscores_total');

    // ---- Get symbols
    const { rows: symbols } = await pool.query(`
      SELECT DISTINCT symbol FROM fundamentals_history
    `);

    const totalSymbols = symbols.length;
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const { symbol } of symbols) {
      try {
        const { rows } = await pool.query(`
          SELECT
            as_of,
            pe_ratio,
            pb_ratio,
            ps_ratio,
            ev_ebitda
          FROM fundamentals_history
          WHERE symbol = $1
          ORDER BY as_of
        `, [symbol]);

        if (rows.length < 8) {
          skippedCount++;
          console.log(`[SKIP] ${symbol}: insufficient history (${rows.length} rows)`);
          continue; // need enough history
        }

        const metrics = {
          pe: rows.map(r => r.pe_ratio).filter(v => v > 0),
          pb: rows.map(r => r.pb_ratio).filter(v => v > 0),
          ps: rows.map(r => r.ps_ratio).filter(v => v > 0),
          ev: rows.map(r => r.ev_ebitda).filter(v => v > 0)
        };

        const stats = {};
        for (const k in metrics) {
          if (metrics[k].length >= 5) {
            const avg = mean(metrics[k]);
            stats[k] = { avg, sd: stddev(metrics[k], avg) };
          }
        }

        const start = Date.now();
        let updatedRows = 0;
        for (const r of rows) {
          await pool.query(`
            INSERT INTO valuation_zscores_timeseries (
              symbol, as_of,
              pe_zscore_ts,
              pb_zscore_ts,
              ps_zscore_ts,
              ev_ebitda_zscore_ts
            )
            VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (symbol, as_of) DO UPDATE SET
              pe_zscore_ts = $3,
              pb_zscore_ts = $4,
              ps_zscore_ts = $5,
              ev_ebitda_zscore_ts = $6
          `, [
            symbol,
            r.as_of,
            stats.pe ? zscore(r.pe_ratio, stats.pe.avg, stats.pe.sd) : null,
            stats.pb ? zscore(r.pb_ratio, stats.pb.avg, stats.pb.sd) : null,
            stats.ps ? zscore(r.ps_ratio, stats.ps.avg, stats.ps.sd) : null,
            stats.ev ? zscore(r.ev_ebitda, stats.ev.avg, stats.ev.sd) : null
          ]);
          updatedRows++;
        }
        const duration = Date.now() - start;
        processedCount++;
        console.log(`[OK] ${symbol}: processed ${rows.length} rows, updated ${updatedRows} z-score rows in ${duration}ms`);
      } catch (symErr) {
        errorCount++;
        console.error(`[ERROR] ${symbol}:`, symErr);
      }
    }

    console.timeEnd('historical_zscores_total');
    console.log(`Done. Symbols: ${totalSymbols}, processed: ${processedCount}, skipped: ${skippedCount}, errors: ${errorCount}`);

    console.log('✓ Historical Z-scores computed');

  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

computeHistoricalZScores();
