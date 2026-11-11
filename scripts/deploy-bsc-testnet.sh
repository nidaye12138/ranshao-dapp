#!/usr/bin/env bash
# Deploy UM-plan modules to BSC Testnet (Chapel, chainId 97).
# Safe to invoke from any cwd (e.g. `./deploy-bsc-testnet.sh` inside scripts/).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="${HOME}/.foundry/bin:${PATH}"

# foundry.toml lives under contracts/
cd "$ROOT/contracts"

RPC_URL="${BSC_TESTNET_RPC_URL:-https://bsc-testnet-rpc.publicnode.com}"
CHAIN_ID=97

need() {
  if [[ -z "${!1:-}" ]]; then
    echo "Missing required env: $1" >&2
    echo "See DEPLOY.md for faucet + key setup." >&2
    exit 1
  fi
}

need PRIVATE_KEY

# Normalize 0x-prefixed key for forge (accepts hex with or without 0x as uint)
if [[ "${PRIVATE_KEY}" == 0x* ]]; then
  :
else
  export PRIVATE_KEY="0x${PRIVATE_KEY}"
fi

DEPLOYER="$(cast wallet address --private-key "$PRIVATE_KEY")"
BAL="$(cast balance "$DEPLOYER" --rpc-url "$RPC_URL")"
echo "Repo root: $ROOT"
echo "Deployer:  $DEPLOYER"
echo "Balance:   $BAL wei on $RPC_URL"
if [[ "$BAL" == "0" ]]; then
  echo "ERROR: deployer has 0 testnet BNB. Fund via BSC testnet faucet, then retry." >&2
  exit 1
fi

mkdir -p "$ROOT/deployments"

echo "Running forge script DeployBscTestnet..."
# Explicit `script` subcommand — `forge path/to.s.sol:...` is NOT valid and yields
# "unrecognized subcommand 'script/...'". Path is relative to contracts/ (cwd).
ARGS=(
  script
  script/DeployBscTestnet.s.sol:DeployBscTestnet
  --rpc-url "$RPC_URL"
  --broadcast
  --slow
  -vvvv
)
if [[ -n "${BSCSCAN_API_KEY:-}" ]]; then
  ARGS+=(--verify --etherscan-api-key "$BSCSCAN_API_KEY" --chain-id "$CHAIN_ID")
fi

forge "${ARGS[@]}"

if [[ -f "$ROOT/deployments/bsc-testnet.json" ]]; then
  echo "Addresses written to deployments/bsc-testnet.json"
  cat "$ROOT/deployments/bsc-testnet.json"
else
  echo "WARN: deployments/bsc-testnet.json not found; check forge broadcast logs." >&2
fi

echo
echo "Optional smoke (buy + burn) — from contracts/:"
echo "  export SWAP=... BURN=... TOKEN=... USDT=... from the JSON"
echo "  forge script script/SmokeBscTestnet.s.sol:SmokeBscTestnet --rpc-url \"\$BSC_TESTNET_RPC_URL\" --broadcast"
