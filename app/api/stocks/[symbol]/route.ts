import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { query } from '@/lib/db';


export async function GET(req: Request, { params }: { params: { symbol: string } }) {
    const { symbol } = params || {};

    if (!symbol || typeof symbol !== 'string') {
        return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
    }

    console.log('API /api/stocks/[symbol] called for', symbol);

    // Helper: coerce numeric-looking strings into numbers (safe - leaves timestamps and words alone)
    const coerceAnalytics = (obj: any) => {
        const out: any = {};
        const numRe = /^-?\d+(?:\.\d+)?$/;
        for (const k in obj) {
            const v = obj[k];
            if (typeof v === 'string' && numRe.test(v)) {
                out[k] = Number(v);
            } else {
                out[k] = v;
            }
        }
        return out;
    };

    try {
        // Try cache first
        const cached = await redis.get(`analytics:${symbol}`);
        console.log('Redis cached value for', symbol, ':' , cached);
        if (cached) {
            // Redis client can return unknown; ensure we only call JSON.parse on strings
            if (typeof cached === 'string') {
                try {
                    const parsed = JSON.parse(cached);
                    const analytics = coerceAnalytics(parsed);
                    console.log('Returning parsed cached value for', symbol, analytics);
                    return NextResponse.json(analytics);
                } catch (e) {
                    // If cached value is corrupt, fallthrough to DB
                    console.warn('Failed to parse cached analytics for', symbol, e);
                }
            } else {
                // If the client already returned a parsed object, coerce and return it directly
                const analytics = coerceAnalytics(cached as any);
                console.log('Returning non-string cached value for', symbol, analytics);
                return NextResponse.json(analytics as any);
            }
        }

        // Fallback to DB: fetch analytics + related tables (fundamentals, risk, zscores, composite)
        const res = await query(`
            SELECT
                a.symbol,
                a.sma20, a.sma50, a.ema12, a.rsi14, a.updated_at AS analytics_updated_at,

                f.pe_ratio, f.forward_pe, f.pb_ratio, f.ps_ratio, f.ev_ebitda,
                f.roe, f.gross_margin, f.operating_margin, f.net_margin,
                f.revenue_growth_3y, f.eps_growth_3y, f.fcf_growth_3y,
                f.debt_to_equity, f.interest_coverage, f.current_ratio, f.updated_at AS fundamentals_updated_at,

                r.beta, r.volatility_30d, r.volatility_90d, r.max_drawdown_1y, r.sharpe_ratio_1y, r.updated_at AS risk_updated_at,

                z.pe_zscore, z.pb_zscore, z.ps_zscore, z.ev_ebitda_zscore, z.updated_at AS zscores_updated_at,

                c.valuation_score, c.profitability_score, c.growth_score, c.risk_score, c.total_score, c.updated_at AS composite_updated_at
            FROM analytics_latest a
            LEFT JOIN fundamentals_latest f ON f.symbol = a.symbol
            LEFT JOIN risk_metrics_latest r ON r.symbol = a.symbol
            LEFT JOIN valuation_zscores_latest z ON z.symbol = a.symbol
            LEFT JOIN composite_scores_latest c ON c.symbol = a.symbol
            WHERE a.symbol = $1
        `, [symbol]);

        const row = res?.rows?.[0] || null;
        console.log('DB row for', symbol, row);
        if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        // Build structured response
        const response = {
            analytics: coerceAnalytics({
                sma20: row.sma20,
                sma50: row.sma50,
                ema12: row.ema12,
                rsi14: row.rsi14,
                updated_at: row.analytics_updated_at
            }),
            fundamentals: coerceAnalytics({
                pe_ratio: row.pe_ratio,
                forward_pe: row.forward_pe,
                pb_ratio: row.pb_ratio,
                ps_ratio: row.ps_ratio,
                ev_ebitda: row.ev_ebitda,
                roe: row.roe,
                gross_margin: row.gross_margin,
                operating_margin: row.operating_margin,
                net_margin: row.net_margin,
                revenue_growth_3y: row.revenue_growth_3y,
                eps_growth_3y: row.eps_growth_3y,
                fcf_growth_3y: row.fcf_growth_3y,
                debt_to_equity: row.debt_to_equity,
                interest_coverage: row.interest_coverage,
                current_ratio: row.current_ratio,
                updated_at: row.fundamentals_updated_at
            }),
            risk: coerceAnalytics({
                beta: row.beta,
                volatility_30d: row.volatility_30d,
                volatility_90d: row.volatility_90d,
                max_drawdown_1y: row.max_drawdown_1y,
                sharpe_ratio_1y: row.sharpe_ratio_1y,
                updated_at: row.risk_updated_at
            }),
            zscores: coerceAnalytics({
                pe_zscore: row.pe_zscore,
                pb_zscore: row.pb_zscore,
                ps_zscore: row.ps_zscore,
                ev_ebitda_zscore: row.ev_ebitda_zscore,
                updated_at: row.zscores_updated_at
            }),
            composite: coerceAnalytics({
                valuation_score: row.valuation_score,
                profitability_score: row.profitability_score,
                growth_score: row.growth_score,
                risk_score: row.risk_score,
                total_score: row.total_score,
                updated_at: row.composite_updated_at
            })
        };

        return NextResponse.json(response);
    } catch (err) {
        console.error('Error in GET /api/stocks/[symbol]:', err);
        return NextResponse.json({ error: 'internal' }, { status: 500 });
    }
}