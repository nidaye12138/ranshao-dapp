#!/usr/bin/env bash
# One-shot CI-safe full-scenario suite: Foundry multi-actor + Playwright UI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.foundry/bin:${PATH}"

echo "==> [1/2] Foundry contracts (unit + FullScenario)"
cd "$ROOT/contracts"
forge test --summary

echo "==> [2/2] Playwright frontend (apps/web e2e)"
cd "$ROOT/apps/web"
if [[ ! -d node_modules ]]; then
  npm ci
fi
npx playwright install chromium --with-deps >/dev/null 2>&1 || npx playwright install chromium
npm run test:e2e

echo "==> Full-scenario suite PASSED"

# Optional Chapel live smoke (skipped unless both env vars are set)
if [[ -n "${BSC_TESTNET_RPC_URL:-}" && -n "${PRIVATE_KEY:-}" ]]; then
  echo "==> Optional Chapel smoke (RPC+key detected)"
  bash "$ROOT/scripts/chapel-smoke.sh" || echo "WARN: Chapel smoke failed (non-blocking for local suite)"
else
  echo "==> Skipping Chapel live smoke (set BSC_TESTNET_RPC_URL + PRIVATE_KEY to enable)"
fi
