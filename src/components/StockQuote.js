import { useState } from "react";

export default function StockQuote() {
  const [symbol, setSymbol] = useState("");
  const [data, setData] = useState(null);

  const fetchQuote = async () => {
    if (!symbol) return;
    const res = await fetch(`/api/yahoo?symbol=${symbol}`);
    const json = await res.json();
    setData(json);
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Yahoo Finance Stock Lookup</h2>

      <input
        type="text"
        placeholder="Enter stock symbol: AAPL"
        value={symbol}
        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
      />

      <button onClick={fetchQuote}>Fetch</button>

      {data && (
        <pre style={{ marginTop: 20, background: "#eee", padding: 10 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
