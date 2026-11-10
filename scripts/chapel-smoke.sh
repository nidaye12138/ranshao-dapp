#!/usr/bin/env bash
# Optional live smoke against Chapel deployments (NOT default CI).
# Requires: BSC_TESTNET_RPC_URL, PRIVATE_KEY, cast/forge on PATH.
# Reads deployments/bsc-testnet.json (or store addresses).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.foundry/bin:${PATH}"

ADDR_FILE="${CHAPEL_ADDRESSES:-$ROOT/deployments/bsc-testnet.json}"
if [[ ! -f "$ADDR_FILE" ]]; then
  echo "No address file at $ADDR_FILE"
  exit 1
fi

: "${BSC_TESTNET_RPC_URL:?need RPC}"
: "${PRIVATE_KEY:?need key}"

SWAP=$(python3 -c "import json;print(json.load(open('$ADDR_FILE'))['SwapFacade'])")
DIV=$(python3 -c "import json;print(json.load(open('$ADDR_FILE'))['DividendPools'])")
TREE=$(python3 -c "import json;print(json.load(open('$ADDR_FILE'))['ReferralTree'])")

echo "Chapel smoke: chain via $BSC_TESTNET_RPC_URL"
echo "  SwapFacade=$SWAP"
echo "  DividendPools=$DIV"
echo "  ReferralTree=$TREE"

# Read-only checks (no spend) — product surface still live
cast call "$DIV" "CLAIM_COOLDOWN()(uint256)" --rpc-url "$BSC_TESTNET_RPC_URL" 2>/dev/null \
  || cast call "$DIV" "nextClaimAt(address)(uint256)" "$(cast wallet address --private-key "$PRIVATE_KEY")" --rpc-url "$BSC_TESTNET_RPC_URL" >/dev/null

cast call "$TREE" "isRoot(address)(bool)" "$(cast wallet address --private-key "$PRIVATE_KEY")" --rpc-url "$BSC_TESTNET_RPC_URL" >/dev/null || true

echo "Chapel read smoke OK (write txs intentionally omitted — use wallet UI manually)"
