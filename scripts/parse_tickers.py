"""Fetch Nasdaq traded tickers and write a clean symbols file.

Writes one ticker symbol per line to `scripts/symbols.txt` by default.
Supports a local source file (CSV) via --source if you already downloaded the feed.
"""

from pathlib import Path
import argparse
import pandas as pd
import logging
from pandas.errors import ParserError

DEFAULT_SOURCE = "https://ftp.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt"
DEFAULT_OUTPUT = Path(__file__).parent / "symbols.txt"


def load_nasdaq_dataframe(source: str) -> pd.DataFrame:
    """Attempt to read the source; try '|' sep first, then fall back to comma."""
    try:
        return pd.read_csv(source, sep=",")
    except ParserError:
        # fallback to comma-delimited (useful for local files like nasdaq-listed.csv)
        return pd.read_csv(source)


def extract_symbols(df: pd.DataFrame):
    # Prefer using explicit ETF/Test Issue columns when present
    if ("ETF" in df.columns) or ("Test Issue" in df.columns):
        cond = pd.Series(True, index=df.index)
        if "ETF" in df.columns:
            cond &= (df.get("ETF") == "N")
        if "Test Issue" in df.columns:
            cond &= (df.get("Test Issue") == "N")
        filtered = df[cond]
        logging.info("Filtered using ETF/Test Issue columns: %d -> %d rows", len(df), len(filtered))
    else:
        # Fallback for files like nasdaq-listed.csv which only have 'Symbol' and 'Security Name'
        # Try to find a column that looks like the security name (case-insensitive match)
        sec_cols = [c for c in df.columns if "security" in c.lower()]
        if sec_cols:
            sec_col = sec_cols[0]
            # remove rows where the security name explicitly contains 'ETF' (case-insensitive)
            filtered = df[~df[sec_col].astype(str).str.contains(r"\bETF\b", case=False, na=False)]
            logging.info("Filtered using Security Name column '%s': %d -> %d rows", sec_col, len(df), len(filtered))
        else:
            # As a last resort, don't filter by type
            filtered = df
            logging.info("No ETF/Test Issue/Security Name columns found; proceeding without type filtering (%d rows)", len(df))

    symbols = filtered.get("Symbol")
    if symbols is None:
        raise RuntimeError("Source does not contain a 'Symbol' column")

    symbols = symbols.dropna().astype(str).str.strip()

    # Remove weird tickers containing '.' or '^'
    symbols = symbols[~symbols.str.contains(r"\.|\^", regex=True)]

    # Deduplicate and sort
    unique = sorted(set(symbols.tolist()))
    return unique


def write_symbols(symbols, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(symbols) + "\n")
    print(f"Wrote {len(symbols)} tickers to {path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create symbols.txt from Nasdaq traded feed")
    parser.add_argument("--source", type=str, default=DEFAULT_SOURCE, help="URL or path to the Nasdaq traded file")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Destination symbols file (one ticker per line)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    try:
        df = load_nasdaq_dataframe(str(args.source))
    except Exception as e:
        raise SystemExit(f"Failed to load source {args.source}: {e}")

    symbols = extract_symbols(df)
    write_symbols(symbols, args.output)
