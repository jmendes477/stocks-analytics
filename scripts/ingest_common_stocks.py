import os
import time
import argparse
import logging
from pathlib import Path
import psycopg2
import yfinance as yf
from pandas.errors import ParserError
from get_all_tickers.get_tickers import get_tickers


POSTGRES_URL = os.environ.get("POSTGRES_URL")
# Don't require POSTGRES_URL at import time so --dry-run works without setting it.
# The script will validate presence of POSTGRES_URL when attempting to connect (unless --dry-run).

RATE_LIMIT_SECONDS = 0.4
BATCH_SIZE_DEFAULT = 100


def load_symbols_from_file(path: str):
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Symbols file not found: {path}")
    symbols = []
    with p.open() as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            symbols.append(line)
    return sorted(set(symbols))


def get_all_usa_tickers(retries: int = 3, backoff: float = 1.0):
    """Fetch tickers from the get_all_tickers package with a few retries.

    Raises RuntimeError with a user-friendly message on repeated failure.
    """
    last_exc = None
    for attempt in range(1, retries + 1):
        try:
            return sorted(set(get_tickers()))
        except ParserError as e:
            logging.warning("get_all_tickers parser error (attempt %d/%d): %s", attempt, retries, e)
            last_exc = e
        except Exception as e:
            logging.warning("get_all_tickers failed (attempt %d/%d): %s", attempt, retries, e)
            last_exc = e

        time.sleep(backoff * attempt)

    raise RuntimeError(
        "Failed to fetch tickers from get_all_tickers after several attempts. "
        "You can pass a local symbols file with --symbols-file to avoid remote fetching."
    ) from last_exc


def is_common_stock(info: dict) -> bool:
    """
    Filters common stocks only
    """
    if not info:
        return False

    quote_type = info.get("quoteType")
    stock_type = info.get("stockType")

    if quote_type != "EQUITY":
        return False

    # If Yahoo provides stockType, enforce COMMON
    if stock_type and stock_type != "COMMON":
        return False

    return True


def fetch_yahoo_metadata(symbol: str):
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info

        if not is_common_stock(info):
            return None

        return {
            "symbol": symbol,
            "name": info.get("shortName") or info.get("longName"),
            "exchange": info.get("exchange"),
            "currency": info.get("currency"),
            "region": "US",
        }

    except Exception as e:
        print(f"[WARN] {symbol}: {e}")
        return None


def upsert_ticker(cur, data):
    cur.execute("""
        INSERT INTO tickers (
            symbol,
            name,
            exchange,
            currency,
            region,
            active,
            last_seen
        )
        VALUES (%s, %s, %s, %s, %s, true, now())
        ON CONFLICT (symbol) DO UPDATE SET
            name = EXCLUDED.name,
            exchange = EXCLUDED.exchange,
            currency = EXCLUDED.currency,
            active = true,
            last_seen = now();
    """, (
        data["symbol"],
        data["name"],
        data["exchange"],
        data["currency"],
        data["region"]
    ))


def dump_symbols(path: str, symbols_file: str | None = None):
    """Write tickers to `path`. If `symbols_file` is provided, use it instead of fetching remotely."""
    if symbols_file:
        symbols = load_symbols_from_file(symbols_file)
    else:
        symbols = get_all_usa_tickers()

    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("\n".join(symbols) + "\n")
    print(f"Wrote {len(symbols)} tickers to {p}")


def main(dry_run=False, limit=None, rate_limit=RATE_LIMIT_SECONDS, symbols_file: str | None = None, batch_size: int = BATCH_SIZE_DEFAULT):
    conn = None
    cur = None

    if symbols_file:
        symbols = load_symbols_from_file(symbols_file)
    else:
        symbols = get_all_usa_tickers()

    if limit:
        symbols = symbols[:limit]
    total = len(symbols)
    logging.info("Discovered %d total tickers (limit=%s), batch_size=%d", total, limit, batch_size)

    processed = 0
    inserted = 0

    try:
        if not dry_run:
            if not POSTGRES_URL:
                raise RuntimeError("Set POSTGRES_URL environment variable or run with --dry-run for testing")
            conn = psycopg2.connect(POSTGRES_URL)
            cur = conn.cursor()
        else:
            logging.info("[DRY-RUN] Running without DB updates")

        for symbol in symbols:
            processed += 1
            data = fetch_yahoo_metadata(symbol)
            if not data:
                logging.debug("No metadata for %s; skipping", symbol)
            else:
                if dry_run:
                    logging.info("[DRY-RUN] Would upsert: %s - %r", data['symbol'], data.get('name'))
                    inserted += 1
                else:
                    try:
                        upsert_ticker(cur, data)
                        inserted += 1
                    except Exception:
                        logging.exception("Upsert failed for %s; rolling back and continuing", symbol)
                        try:
                            if conn:
                                conn.rollback()
                        except Exception:
                            logging.exception("Rollback failed after upsert error")

            # Periodic progress log
            if processed % max(1, batch_size // 10) == 0:
                logging.info("Processed %d/%d tickers; inserted %d", processed, total, inserted)

            # Commit each batch
            if not dry_run and (processed % batch_size == 0):
                try:
                    conn.commit()
                    logging.info("Committed batch at %d/%d (inserted %d so far)", processed, total, inserted)
                except Exception:
                    logging.exception("Commit failed after processing %d tickers; rolling back", processed)
                    try:
                        conn.rollback()
                    except Exception:
                        logging.exception("Rollback failed after commit error")

            time.sleep(rate_limit)

        # Final commit for remaining work
        if not dry_run and conn:
            try:
                conn.commit()
                logging.info("Final commit complete")
            except Exception:
                logging.exception("Final commit failed; attempting rollback")
                try:
                    conn.rollback()
                except Exception:
                    logging.exception("Final rollback failed")

    except KeyboardInterrupt:
        logging.warning("Interrupted by user; attempting to commit pending changes")
        if not dry_run and conn:
            try:
                conn.commit()
                logging.info("Committed pending work after interrupt")
            except Exception:
                logging.exception("Commit failed during interrupt; rolling back")
                try:
                    conn.rollback()
                except Exception:
                    logging.exception("Rollback failed during interrupt")
        raise
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

    logging.info("Inserted/updated %d common stocks%s", inserted, " (dry-run)" if dry_run else "")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest common US tickers into the database")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to the database; just fetch and print what would be inserted")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of tickers processed (useful for testing)")
    parser.add_argument("--rate-limit", type=float, default=RATE_LIMIT_SECONDS, help="Seconds to wait between requests")
    parser.add_argument("--symbols-file", type=str, default=None, help="Path to a file with one ticker symbol per line (useful to avoid remote fetching)")
    parser.add_argument("--dump-symbols", type=str, default=None, help="Write the full symbols list to PATH and exit (useful to create scripts/symbols.txt)")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE_DEFAULT, help="Number of tickers to process per DB commit (default 100)")
    args = parser.parse_args()


    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    # If requested, dump symbols to a file and exit before doing any DB work
    if args.dump_symbols:
        dump_symbols(args.dump_symbols, symbols_file=args.symbols_file)
        raise SystemExit(0)

    try:
        main(dry_run=args.dry_run, limit=args.limit, rate_limit=args.rate_limit, symbols_file=args.symbols_file, batch_size=args.batch_size)
    except Exception:
        logging.exception("Script failed")
        raise
