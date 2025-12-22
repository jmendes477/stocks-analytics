ingest_common_stocks.py — README

Purpose
-------
A small helper script to populate the `tickers` table from Yahoo and a list of exchange tickers.

Prerequisites
-------------
- Python 3.8+ (3.11 recommended)
- A virtual environment (recommended)
- PostgreSQL accessible via a connection URL (for non-dry runs)

Quick setup
-----------
# create and activate a venv
python3 -m venv .venv
source .venv/bin/activate

# install dependencies
pip install get-all-tickers yfinance psycopg2-binary pandas

Usage
-----
The script supports the following flags:
- `--dry-run`: fetch metadata but do not write to the DB
- `--limit N`: process only the first N tickers (useful for testing)
- `--rate-limit X`: seconds to wait between Yahoo requests (default 0.4)
- `--symbols-file PATH`: read tickers from a local file (one ticker per line)

Environment
-----------
- `POSTGRES_URL` must be set when running for real (omit for `--dry-run`).
  Example:

export POSTGRES_URL='postgresql://user:pass@host/db?sslmode=require'

Examples
--------
# Dry-run using the example symbols file (no DB writes)
python scripts/ingest_common_stocks.py --dry-run --limit 10 --symbols-file scripts/symbols.example.txt

# Dry-run fetching the ticker list remotely (may be slower / fail if remote parsing fails)
python scripts/ingest_common_stocks.py --dry-run --limit 10

# Real run (writes to DB) for 100 tickers
export POSTGRES_URL='postgresql://user:pass@host/db?sslmode=require'
python scripts/ingest_common_stocks.py --limit 100

# Dump symbols to a file
# Creates (or overwrites) the file at the given path with one ticker per line.
python scripts/ingest_common_stocks.py --dump-symbols scripts/symbols.txt
# Or use the helper script:
python scripts/dump_symbols.py scripts/symbols.txt

Node fetch runtime note
-----------------------
The worker `scripts/process-ticker.cjs` uses `yahoo-finance2` which relies on `fetch` in Node.
- Preferred: run on Node 18+ where `fetch` is built-in. Check with `node -v`.
- Alternative: install `undici` and the worker will use it automatically as a polyfill:

npm install undici

If you still see `ReferenceError: fetch is not defined`, upgrade Node or install `undici` as described above.

Notes & troubleshooting
-----------------------
- Avoid committing `POSTGRES_URL` or other secrets to source control.
- If `get_all_tickers` fails to parse remote CSVs (parser errors), use `--symbols-file` to bypass the remote fetch and provide your own list.
- The script filters to common equities before inserting. Ensure your `tickers` table has columns: `symbol, name, exchange, currency, region, active, last_seen`.

Feedback / improvements
-----------------------
If you'd like, I can:
- Add a `requirements.txt` and a Makefile entry for quick setup
- Add structured logging and a `--verbose` flag
- Add batching or retries for DB operations

