try { require('dotenv').config({ path: '.env.local' }); } catch (e) { /* noop */ }

const { createPool } = require('@vercel/postgres');

async function snapshotFundamentals() {
  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!conn) {
    console.error('DATABASE_URL or POSTGRES_URL is required');
    process.exit(1);
  }

  const pool = createPool({ connectionString: conn });

  try {
    console.log('Snapshotting fundamentals_latest -> fundamentals_history (as_of = CURRENT_DATE)');
    const force = process.env.FORCE_UPDATE === 'true';

    const insertDoNothing = `
      INSERT INTO fundamentals_history (
        symbol, as_of,
        pe_ratio, pb_ratio, ps_ratio, ev_ebitda,
        revenue_growth_3y, eps_growth_3y
      )
      SELECT
        symbol, CURRENT_DATE,
        pe_ratio, pb_ratio, ps_ratio, ev_ebitda,
        revenue_growth_3y, eps_growth_3y
      FROM fundamentals_latest
      ON CONFLICT (symbol, as_of) DO NOTHING
    `;

    const insertDoUpdate = `
      INSERT INTO fundamentals_history (
        symbol, as_of,
        pe_ratio, pb_ratio, ps_ratio, ev_ebitda,
        revenue_growth_3y, eps_growth_3y
      )
      SELECT
        symbol, CURRENT_DATE,
        pe_ratio, pb_ratio, ps_ratio, ev_ebitda,
        revenue_growth_3y, eps_growth_3y
      FROM fundamentals_latest
      ON CONFLICT (symbol, as_of) DO UPDATE SET
        pe_ratio = EXCLUDED.pe_ratio,
        pb_ratio = EXCLUDED.pb_ratio,
        ps_ratio = EXCLUDED.ps_ratio,
        ev_ebitda = EXCLUDED.ev_ebitda,
        revenue_growth_3y = EXCLUDED.revenue_growth_3y,
        eps_growth_3y = EXCLUDED.eps_growth_3y
    `;

    const query = force ? insertDoUpdate : insertDoNothing;

    const res = await pool.query(query);

    console.log('Snapshot complete. Rows affected:', res.rowCount);
    if (!force) console.log('Note: existing rows for today are preserved (DO NOTHING). Set FORCE_UPDATE=true to overwrite.');
  } catch (e) {
    console.error('snapshot-fundamentals error', e);
    process.exit(1);
  } finally {
    try { await pool.end(); } catch (e) { /* ignore */ }
  }
}

snapshotFundamentals();
