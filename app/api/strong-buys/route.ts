import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const sql = `
      select
          t.symbol,
          t.name,    
          z.pe_zscore,
          z.ev_ebitda_zscore,
          zt.avg_pe_zscore_ts,    
          f.roic,
          f.roe,
          f.operating_margin,    
          r.beta,
          c.total_score
      from tickers t
      join fundamentals_latest f using (symbol)
      join valuation_zscores_latest z using (symbol)
      join (
          select
              symbol,
              avg(pe_zscore_ts) as avg_pe_zscore_ts
          from valuation_zscores_timeseries
          where as_of >= current_date - interval '180 days'
          group by symbol
      ) zt
          using (symbol)
      left join risk_metrics_latest r
          using (symbol)
      left join composite_scores_latest c
          using (symbol)
      where
        z.pe_zscore < 0
        -- AND zt.avg_pe_zscore_ts < -1
        -- AND z.ev_ebitda_zscore < 0
        -- AND zt.pe_zscore_ts < -1
        -- AND f.roic > 0.12
        AND f.operating_margin > 0.10
        -- AND f.debt_to_equity < 1.0
        AND f.current_ratio > 1.2
        AND (r.beta BETWEEN 0.7 AND 1.3 OR r.beta IS NULL)
      ORDER BY
        c.total_score DESC NULLS LAST,
        z.pe_zscore ASC
      LIMIT 200
    `;

    const res = await query(sql);
    return NextResponse.json({ ok: true, rows: res.rows });
  } catch (err: any) {
    console.error('Error in GET /api/strong-buys:', err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
