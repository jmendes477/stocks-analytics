"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
// import "./globals.css"; // if you want to keep your CSS

export default function HomePage() {
  const [selectedTicker, setSelectedTicker] = useState("");
  const [stockData, setStockData] = useState(null);
  const [intrinsicValues, setIntrinsicValues] = useState({
    peMethod: null,
    dcf: null,
    graham: null,
    nav: null,
  });
  const [parameters, setParameters] = useState({
    growthRate: 10,
    discountRate: 10,
    terminalGrowthRate: 2,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tickers = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"];

  const fetchStockData = async (ticker) => {
    setLoading(true);
    setError("");
    setStockData(null);
    setIntrinsicValues({
      peMethod: null,
      dcf: null,
      graham: null,
      nav: null,
    });

    try {
      // Try to get analytics (cache / DB)
      const analyticsPromise = axios.get(`/api/stocks/${ticker}`).catch((e) => e.response || e);
      // Also attempt to get market details (price, eps) from Yahoo
      const yahooPromise = axios.get(`/api/yahoo?ticker=${ticker}`).catch((e) => e.response || e);

      const [analyticsRes, yahooRes] = await Promise.all([analyticsPromise, yahooPromise]);

      // Normalize API response: the server returns EITHER a raw analytics object (from Redis cache)
      // OR a nested object with `analytics`, `fundamentals`, etc. (from DB fallback). Handle both.
      console.log('analyticsRes:', analyticsRes);
      let apiData = null;
      if (analyticsRes && analyticsRes.status === 200 && !analyticsRes.data?.error) {
        const d = analyticsRes.data;
        if (d && typeof d === 'object') {
          if (d.analytics || d.fundamentals || d.risk || d.zscores || d.composite) {
            apiData = d;
          } else {
            // Cached single-analytics shape — wrap so rest of the UI expects the nested shape
            apiData = { analytics: d, fundamentals: null, risk: null, zscores: null, composite: null };
          }
        }
      }

      let market = null;
      if (yahooRes && yahooRes.status === 200 && yahooRes.data?.body?.[0]) {
        market = yahooRes.data.body[0];
      }

      console.log('apiData after normalization:', apiData);

      const eps = market?.epsTrailingTwelveMonths ?? null;
      const price = market?.regularMarketPrice ?? null;
      const trailingPE = market?.trailingPE ?? null;
      const sharesOutstanding = market?.sharesOutstanding ?? null;

      setStockData({
        eps,
        price,
        trailingPE,
        sharesOutstanding,
        analytics: apiData?.analytics ?? null,
        fundamentals: apiData?.fundamentals ?? null,
        risk: apiData?.risk ?? null,
        zscores: apiData?.zscores ?? null,
        composite: apiData?.composite ?? null,
      });

      if (!apiData?.analytics) {
        // Friendly hint to the user (optional)
        setError("Analytics not found for this ticker yet — processing may be required.");
      }
    } catch (err) {
      console.error("Failed fetching stock/analytics:", err);
      setError("Failed to fetch stock data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const calculateIntrinsicValues = () => {
    // Only compute once we have necessary data
    if (!stockData || stockData.eps == null || stockData.sharesOutstanding == null) return;

    const { eps, sharesOutstanding } = stockData;
    const { growthRate, discountRate, terminalGrowthRate } = parameters;

    const futureCashFlows = [10, 12, 14, 16, 18];
    const terminalValue =
      (futureCashFlows[futureCashFlows.length - 1] * (1 + terminalGrowthRate / 100)) /
      (discountRate / 100 - terminalGrowthRate / 100);

    const dcfValue =
      futureCashFlows.reduce(
        (acc, fcf, i) => acc + fcf / Math.pow(1 + discountRate / 100, i + 1),
        0
      ) + terminalValue / Math.pow(1 + discountRate / 100, futureCashFlows.length);

    const grahamValue = eps * (8.5 + 2 * growthRate);
    const nav = (5000000000 - 2000000000) / sharesOutstanding;
    const peMethod = eps * 15;

    setIntrinsicValues({
      peMethod: peMethod.toFixed(2),
      dcf: dcfValue.toFixed(2),
      graham: grahamValue.toFixed(2),
      nav: nav.toFixed(2),
    });
  };

  useEffect(() => {
    calculateIntrinsicValues();
  }, [parameters, stockData]);

  return (
    <div className="container">
      <div className="top-row">
        <div>
          <h1 className="header">Stock Intrinsic Value Calculator</h1>
          <div className="controls">
            <select
              value={selectedTicker}
              onChange={(e) => setSelectedTicker(e.target.value)}
              className="select"
            >
              <option value="" disabled>
                Select a stock
              </option>
              {tickers.map((ticker) => (
                <option key={ticker} value={ticker}>
                  {ticker}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Or type ticker"
              className="input"
              value={selectedTicker}
              onChange={(e) => setSelectedTicker(e.target.value.toUpperCase())}
            />

            <button
              onClick={() => selectedTicker && fetchStockData(selectedTicker)}
              className="button"
              disabled={loading}
            >
              {loading ? 'Fetching...' : 'Fetch Data'}
            </button>
          </div>

          <div className="parameters">
            <div className="input-group">
              <label>Growth Rate (%):</label>
              <input
                type="number"
                name="growthRate"
                value={parameters.growthRate}
                onChange={(e) => setParameters({ ...parameters, growthRate: +e.target.value })}
                className="input"
              />
            </div>

            <div className="input-group">
              <label>Discount Rate (%):</label>
              <input
                type="number"
                name="discountRate"
                value={parameters.discountRate}
                onChange={(e) => setParameters({ ...parameters, discountRate: +e.target.value })}
                className="input"
              />
            </div>

            <div className="input-group">
              <label>Terminal Growth Rate (%):</label>
              <input
                type="number"
                name="terminalGrowthRate"
                value={parameters.terminalGrowthRate}
                onChange={(e) => setParameters({ ...parameters, terminalGrowthRate: +e.target.value })}
                className="input"
              />
            </div>
          </div>
        </div>

        <div className="summary-card card">
          <div className="card-title">Summary</div>
          <div className="summary-row">
            <div className="price">{stockData?.price != null ? `$${Number(stockData.price).toFixed(2)}` : '—'}</div>
            <div className="meta">
              <div>EPS: <strong>{stockData?.eps != null ? `$${Number(stockData.eps).toFixed(2)}` : '—'}</strong></div>
              <div>Trailing P/E: <strong>{stockData?.trailingPE ?? '—'}</strong></div>
              <div>Shares: <strong>{stockData?.sharesOutstanding ?? '—'}</strong></div>
            </div>
          </div>
          {stockData?.analytics?.updated_at && (
            <div className="updated">Updated: {new Date(stockData.analytics.updated_at).toLocaleString()}</div>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="tables-grid">
        <div className="card">
          <div className="card-title">Intrinsic Values</div>
          <table className="table">
            <thead>
              <tr><th>Method</th><th>Value</th></tr>
            </thead>
            <tbody>
              <tr><td>P/E Method</td><td>{intrinsicValues.peMethod ? `$${intrinsicValues.peMethod}` : '—'}</td></tr>
              <tr><td>DCF</td><td>{intrinsicValues.dcf ? `$${intrinsicValues.dcf}` : '—'}</td></tr>
              <tr><td>Benjamin Graham</td><td>{intrinsicValues.graham ? `$${intrinsicValues.graham}` : '—'}</td></tr>
              <tr><td>NAV</td><td>{intrinsicValues.nav ? `$${intrinsicValues.nav}` : '—'}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">Analytics</div>
          <table className="table">
            <thead>
              <tr><th>Metric</th><th>Value</th></tr>
            </thead>
            <tbody>
              {stockData?.analytics && Object.entries(stockData.analytics).map(([k, v]) => {
                if (v == null) return null;
                if (k === 'symbol') return null;
                const keyLower = k.toLowerCase();
                const valNum = typeof v === 'number' ? v : (Number(v).toString() === 'NaN' ? null : Number(v));
                let cls = 'neutral';
                let arrow = '';
                if (keyLower.includes('rsi') && typeof valNum === 'number') {
                  cls = valNum >= 70 ? 'negative' : valNum <= 30 ? 'positive' : 'neutral';
                }
                if ((keyLower.includes('sma') || keyLower.includes('ema')) && typeof valNum === 'number' && stockData?.price != null) {
                  cls = stockData.price > valNum ? 'positive' : 'negative';
                  arrow = stockData.price > valNum ? '▲' : '▼';
                }
                return (
                  <tr key={k} className={cls}><td>{k.replace(/_/g,' ').toUpperCase()}</td><td><span className={`badge ${cls}`}>{valNum != null ? valNum.toFixed(2) : String(v)} {arrow}</span></td></tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">Fundamentals</div>
          <table className="table">
            <thead>
              <tr><th>Metric</th><th>Value</th></tr>
            </thead>
            <tbody>
              {stockData?.fundamentals ? (
                <>
                  <tr><td>PE Ratio</td><td>{stockData.fundamentals.pe_ratio != null ? Number(stockData.fundamentals.pe_ratio).toFixed(2) : '—'}</td></tr>
                  <tr><td>Forward PE</td><td>{stockData.fundamentals.forward_pe != null ? Number(stockData.fundamentals.forward_pe).toFixed(2) : '—'}</td></tr>
                  <tr><td>PB Ratio</td><td>{stockData.fundamentals.pb_ratio != null ? Number(stockData.fundamentals.pb_ratio).toFixed(2) : '—'}</td></tr>
                  <tr><td>PS Ratio</td><td>{stockData.fundamentals.ps_ratio != null ? Number(stockData.fundamentals.ps_ratio).toFixed(2) : '—'}</td></tr>
                  <tr><td>EV / EBITDA</td><td>{stockData.fundamentals.ev_ebitda != null ? Number(stockData.fundamentals.ev_ebitda).toFixed(2) : '—'}</td></tr>
                  <tr><td>ROE</td><td>{stockData.fundamentals.roe != null ? (Number(stockData.fundamentals.roe)*100).toFixed(2) + '%' : '—'}</td></tr>
                  <tr><td>Revenue Growth (3y)</td><td>{stockData.fundamentals.revenue_growth_3y != null ? (Number(stockData.fundamentals.revenue_growth_3y)*100).toFixed(2) + '%' : '—'}</td></tr>
                  <tr><td>EPS Growth (3y)</td><td>{stockData.fundamentals.eps_growth_3y != null ? (Number(stockData.fundamentals.eps_growth_3y)*100).toFixed(2) + '%' : '—'}</td></tr>
                </>
              ) : (
                <tr><td colSpan={2}>Fundamentals not available</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">Risk & Scores</div>
          <table className="table">
            <thead><tr><th>Metric</th><th>Value</th></tr></thead>
            <tbody>
              {stockData?.risk ? (
                <>
                  <tr><td>Beta</td><td>{stockData.risk.beta != null ? Number(stockData.risk.beta).toFixed(2) : '—'}</td></tr>
                  <tr><td>Volatility 30d</td><td>{stockData.risk.volatility_30d != null ? Number(stockData.risk.volatility_30d).toFixed(2) : '—'}</td></tr>
                </>
              ) : null}

              {stockData?.zscores ? (
                <>
                  <tr><td>PE z-score</td><td>{stockData.zscores.pe_zscore != null ? Number(stockData.zscores.pe_zscore).toFixed(2) : '—'}</td></tr>
                  <tr><td>PS z-score</td><td>{stockData.zscores.ps_zscore != null ? Number(stockData.zscores.ps_zscore).toFixed(2) : '—'}</td></tr>
                </>
              ) : null}

              {stockData?.composite ? (
                <tr><td>Total Score</td><td>{stockData.composite.total_score != null ? Number(stockData.composite.total_score).toFixed(2) : '—'}</td></tr>
              ) : null}

              {!stockData?.risk && !stockData?.zscores && !stockData?.composite && (
                <tr><td colSpan={2}>No risk/scores data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {loading && <p>Loading...</p>}
    </div>
  );
}
