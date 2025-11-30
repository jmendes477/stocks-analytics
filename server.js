const express = require("express");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// require CommonJS handler
const handler = require("./api/yahoo");

app.get("/api/yahoo", async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    res.status(500).json({ error: "server wrapper error", details: err.message });
  }
});

app.listen(port, () => console.log(`Backend server listening at http://localhost:${port}`));