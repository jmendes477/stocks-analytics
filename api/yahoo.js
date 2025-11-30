async function handler(req, res) {
  try {
    const { ticker } = req.query;
    const apiKey = process.env.RAPIDAPI_KEY; // secure key stored on Vercel    
    if (!ticker) {
      return res.status(400).json({ error: "Missing ticker parameter" });
    }

    const url = "https://yahoo-finance15.p.rapidapi.com/api/v1/markets/stock/quotes";

    const response = await fetch(`${url}?ticker=${ticker}`, {
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "yahoo-finance15.p.rapidapi.com",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({ error: "Yahoo API error", details: text });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: "Server error", details: err.message });
  }
}

module.exports = handler;
