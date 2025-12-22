#!/usr/bin/env bash
set -euo pipefail

# Ensure we use the expected Node.js installation from NVM (v24.3.0)
: "${NVM_DIR:=$HOME/.nvm}"
export NVM_DIR
# If nvm is available, source it so any shims are active
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi
# Prepend the specific node version bin dir to PATH so `node` refers to v24.3.0
export PATH="$NVM_DIR/versions/node/v24.3.0/bin:$PATH"

# process_all_tickers.sh
# Usage: ./scripts/process_all_tickers.sh [--symbols-file PATH] [--parallel N] [--skip-processed] [--retry-failed]
#
# Reads a symbols file (one ticker per line) and runs `node scripts/process-ticker.cjs <SYMBOL>` for each.
# Features:
# - Parallel execution via xargs -P (default 4)
# - Optional skip of already-processed symbols (requires psql and DATABASE_URL or POSTGRES_URL env)
# - Logging to logs/process.log and logs/process.err
# - Failed symbols appended to logs/failed.txt for later retry

SCRIPTDIR="$(cd "$(dirname "$0")" && pwd)"
SYMBOLS_FILE="$SCRIPTDIR/symbols.txt"
PARALLEL=4
SKIP_PROCESSED=0
RETRY_FAILED=0

print_usage() {
  cat <<-USAGE
Usage: $0 [--symbols-file PATH] [--parallel N] [--skip-processed] [--retry-failed]

Options:
  --symbols-file PATH   Path to symbols file (default: scripts/symbols.txt)
  --parallel N          Number of parallel workers (default: 4)
  --skip-processed     Skip symbols that already exist in analytics_latest (requires psql and DATABASE_URL/POSTGRES_URL)
  --retry-failed        Retry only symbols recorded in logs/failed.txt
  --help                Show this message
USAGE
}

# parse args
while [[ ${#} -gt 0 ]]; do
  case "$1" in
    --symbols-file)
      SYMBOLS_FILE="$2"; shift 2;;
    --parallel)
      PARALLEL="$2"; shift 2;;
    --skip-processed)
      SKIP_PROCESSED=1; shift;;
    --retry-failed)
      RETRY_FAILED=1; shift;;
    --help)
      print_usage; exit 0;;
    *)
      echo "Unknown arg: $1" >&2; print_usage; exit 2;;
  esac
done

# Sanity checks
REQUIRED_NODE_VERSION="v24.3.0"
if ! command -v node >/dev/null 2>&1; then
  echo "node not found in PATH (tried NVM_DIR=$NVM_DIR)" >&2; exit 2
fi
NODE_V="$(node -v || true)"
if [[ "$NODE_V" != "$REQUIRED_NODE_VERSION" ]]; then
  echo "Error: node version is $NODE_V, expected $REQUIRED_NODE_VERSION. Please install/activate Node $REQUIRED_NODE_VERSION (via nvm) or set NVM_DIR to where it's installed." >&2
  exit 2
fi
if ! command -v xargs >/dev/null 2>&1; then
  echo "xargs not found in PATH" >&2; exit 2
fi

LOGDIR="$SCRIPTDIR/logs"
mkdir -p "$LOGDIR"
PROCESS_LOG="$LOGDIR/process.log"
ERROR_LOG="$LOGDIR/process.err"
FAILED_LIST="$LOGDIR/failed.txt"
: >"$PROCESS_LOG"
: >"$ERROR_LOG"
: >"$FAILED_LIST"

# Choose input list
if [[ "$RETRY_FAILED" -eq 1 ]]; then
  if [[ ! -f "$FAILED_LIST" ]]; then
    echo "No failed list found at $FAILED_LIST" >&2; exit 2
  fi
  INPUT_FILE="$FAILED_LIST"
else
  if [[ ! -f "$SYMBOLS_FILE" ]]; then
    echo "Symbols file not found: $SYMBOLS_FILE" >&2; exit 2
  fi
  INPUT_FILE="$SYMBOLS_FILE"
fi

# Build the list of symbols, skip comments and blank lines
TMP_LIST="$(mktemp)"
awk 'BEGIN{FS="\n"} /^\s*#/ {next} /^\s*$/ {next} {print $0}' "$INPUT_FILE" > "$TMP_LIST"

# Optionally remove already processed symbols
if [[ "$SKIP_PROCESSED" -eq 1 ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "psql is required for --skip-processed" >&2; exit 2
  fi
  if [[ -z "${DATABASE_URL:-}${POSTGRES_URL:-}" ]]; then
    echo "Set DATABASE_URL or POSTGRES_URL env var to use --skip-processed" >&2; exit 2
  fi
  echo "Fetching already-processed symbols from DB..."
  PROCESSED_TMP="$(mktemp)"
  PSQL_CONN="${DATABASE_URL:-${POSTGRES_URL:-}}"
  # -t silence headers, -A unaligned
  eval "psql '$PSQL_CONN' -t -A -c \"SELECT symbol FROM analytics_latest\"" >"$PROCESSED_TMP" || true
  # Filter out processed symbols
  grep -Fvx -f "$PROCESSED_TMP" "$TMP_LIST" > "$TMP_LIST".filtered || true
  mv "$TMP_LIST".filtered "$TMP_LIST"
  rm -f "$PROCESSED_TMP"
fi

# Worker command for xargs - runs process-ticker and logs failures
worker_cmd() {
  symbol="$1"
  if node "$SCRIPTDIR/process-ticker.cjs" "$symbol" >>"$PROCESS_LOG" 2>>"$ERROR_LOG"; then
    echo "OK: $symbol"
    return 0
  else
    echo "FAILED: $symbol" >> "$FAILED_LIST"
    return 1
  fi
}
export -f worker_cmd
export SCRIPTDIR PROCESS_LOG ERROR_LOG FAILED_LIST

# Use xargs to process in parallel; print simple progress
TOTAL=$(wc -l < "$TMP_LIST" | tr -d ' ')
echo "Processing $TOTAL symbols with parallel=$PARALLEL (logs: $LOGDIR)"

# xargs approach: pass each symbol to bash -c 'worker_cmd "$0"'
cat "$TMP_LIST" | xargs -I{} -n1 -P "$PARALLEL" bash -lc 'worker_cmd "{}"'

echo "Done. See $PROCESS_LOG and $ERROR_LOG. Failed items (if any) in $FAILED_LIST"
rm -f "$TMP_LIST"
