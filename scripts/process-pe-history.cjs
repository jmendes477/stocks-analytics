// CommonJS
try { require("dotenv").config({ path: ".env.local" }); } catch {}

const { createPool } = require("@vercel/postgres");
const Yahoo = require("yahoo-finance2").default;

const SYMBOL = process.argv[2];
if (!SYMBOL) {
  console.error("Usage: node process-pe-history.cjs MSFT");
  process.exit(1);
}

const pool = createPool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL
});

async function main() {
  try {
    /* -------------------------------
       1️⃣ Fetch quarterly EPS
    --------------------------------*/
    const summary = await Yahoo.quoteSummary(SYMBOL, {
      modules: ["incomeStatementHistoryQuarterly"]
    });

    const quarters =
      summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];

    if (quarters.length < 4) {
      console.error("Not enough EPS history for", SYMBOL);
      return;
    }
    console.log(`Fetched ${quarters.length} quarters of EPS for ${SYMBOL}`);
    // Normalize + sort oldest → newest
    const epsSeries = quarters
      .map(q => ({
        date: new Date(q.endDate * 1000),
        eps: q.dilutedEPS
      }))
      .filter(q => q.eps != null)
      .sort((a, b) => a.date - b.date);

    // Build EPS TTM per quarter
    const epsTTM = [];
    for (let i = 3; i < epsSeries.length; i++) {
      const ttm =
        epsSeries[i].eps +
        epsSeries[i - 1].eps +
        epsSeries[i - 2].eps +
        epsSeries[i - 3].eps;

      epsTTM.push({
        asOf: epsSeries[i].date,
        epsTTM: ttm
      });
    }

    /* -------------------------------
       2️⃣ Fetch 12 months of prices
    --------------------------------*/
    const chart = await Yahoo.chart(SYMBOL, {
      range: "1y",
      interval: "1d"
    });

    const timestamps = chart.timestamp || [];
    const closes = chart.indicators?.quote?.[0]?.close || [];

    /* -------------------------------
       3️⃣ Build daily PE history
    --------------------------------*/
    let epsIdx = 0;

    for (let i = 0; i < timestamps.length; i++) {
      const priceDate = new Date(timestamps[i] * 1000);
      const close = closes[i];

      if (!close) continue;

      // Move EPS pointer to most recent known quarter
      while (
        epsIdx + 1 < epsTTM.length &&
        epsTTM[epsIdx + 1].asOf <= priceDate
      ) {
        epsIdx++;
      }

      const eps = epsTTM[epsIdx]?.epsTTM;
      if (!eps || eps <= 0) continue;

      const pe = close / eps;

      // await pool.query(
      //   `
      //   INSERT INTO pe_history (
      //     symbol, as_of, close_price, eps_ttm, pe_ratio
      //   )
      //   VALUES ($1,$2,$3,$4,$5)
      //   ON CONFLICT (symbol, as_of) DO NOTHING
      //   `,
      //   [
      //     SYMBOL,
      //     priceDate.toISOString().slice(0, 10),
      //     close,
      //     eps,
      //     pe
      //   ]
      // );
    }

    console.log(`✅ PE history built (12mo) for ${SYMBOL}`);
  } catch (err) {
    console.error("process-pe-history error", err);
  } finally {
    await pool.end();
  }
}

main();
