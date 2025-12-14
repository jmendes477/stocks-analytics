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
      const analyticsPromise = axios.get(`/api/stocks/${ticker}`).catch((e) => e);
      // Also attempt to get market details (price, eps) from Yahoo
      const yahooPromise = axios.get(`/api/yahoo?ticker=${ticker}`).catch((e) => e);

      const [analyticsRes, yahooRes] = await Promise.all([analyticsPromise, yahooPromise]);

      let analytics = null;
      if (analyticsRes && analyticsRes.status === 200 && !analyticsRes.data?.error) {
        analytics = analyticsRes.data;
      }

      let market = null;
      if (yahooRes && yahooRes.status === 200 && yahooRes.data?.body?.[0]) {
        market = yahooRes.data.body[0];
      }

      const eps = market?.epsTrailingTwelveMonths ?? null;
      const price = market?.regularMarketPrice ?? null;
      const trailingPE = market?.trailingPE ?? null;
      const sharesOutstanding = market?.sharesOutstanding ?? null;

      setStockData({
        eps,
        price,
        trailingPE,
        sharesOutstanding,
        analytics,
      });

      if (!analytics) {
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
      <h1 className="header">Stock Intrinsic Value Calculator</h1>

      <label>
        Select or enter a stock ticker:
        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
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
          >
            Fetch Data
          </button>
        </div>
      </label>

      <div className="parameters">
        <div className="input-group">
          <label>Growth Rate (%):</label>
          <input
            type="number"
            name="growthRate"
            value={parameters.growthRate}
            onChange={(e) =>
              setParameters({ ...parameters, growthRate: +e.target.value })
            }
            className="input"
          />
        </div>

        <div className="input-group">
          <label>Discount Rate (%):</label>
          <input
            type="number"
            name="discountRate"
            value={parameters.discountRate}
            onChange={(e) =>
              setParameters({ ...parameters, discountRate: +e.target.value })
            }
            className="input"
          />
        </div>

        <div className="input-group">
          <label>Terminal Growth Rate (%):</label>
          <input
            type="number"
            name="terminalGrowthRate"
            value={parameters.terminalGrowthRate}
            onChange={(e) =>
              setParameters({ ...parameters, terminalGrowthRate: +e.target.value })
            }
            className="input"
          />
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}

      {stockData && (
        <div className="data-section">
          <h3>Stock Details</h3>
          <p>Price: ${stockData.price}</p>
          <p>EPS: ${stockData.eps}</p>
          <p>Trailing P/E: {stockData.trailingPE}</p>
        </div>
      )}

      {intrinsicValues && (
        <div className="intrinsic-values">
          <h3>Intrinsic Value</h3>
          <p>P/E Method: ${intrinsicValues.peMethod}</p>
          <p>DCF: ${intrinsicValues.dcf}</p>
          <p>Benjamin Graham: ${intrinsicValues.graham}</p>
          <p>NAV: ${intrinsicValues.nav}</p>
        </div>
      )}

      {stockData?.analytics && (
        <div className="analytics-section">
          <h3>Analytics</h3>
          <p>SMA (20): {Number(stockData.analytics.sma20).toFixed(2)}</p>
          <p>SMA (50): {Number(stockData.analytics.sma50).toFixed(2)}</p>
          <p>EMA (12): {Number(stockData.analytics.ema12).toFixed(2)}</p>
          <p>RSI (14): {Number(stockData.analytics.rsi14).toFixed(2)}</p>
        </div>
      )}
    </div>
  );
}
