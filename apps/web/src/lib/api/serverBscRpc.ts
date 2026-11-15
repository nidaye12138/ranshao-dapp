/**
 * Server-side BSC RPC selection for API routes.
 * Prefer env / BNB Chain seeds used by the client; put publicnode last (429 on eth_getLogs).
 */

const PUBLICNODE = /publicnode\.com/i;
const SEEDS = [
  "https://bsc-dataseed1.bnbchain.org",
  "https://bsc-dataseed2.bnbchain.org",
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-dataseed1.ninicoin.io",
  "https://bsc-rpc.publicnode.com",
] as const;

/**
 * RPCs that tolerate eth_getLogs (bnbchain dataseeds reject almost all getLogs).
 * 48.club allows ≤5000-block windows; publicnode/blxr for scoped queries.
 */
const LOGS_SEEDS = [
  "https://rpc-bsc.48.club",
  "https://bsc-rpc.publicnode.com",
  "https://bsc.publicnode.com",
  "https://bsc.rpc.blxrbdn.com",
] as const;

/** Ordered unique RPC URLs for server eth_call / getLogs. */
export function serverBscRpcCandidates(): string[] {
  const env = [
    process.env.BSC_RPC_URL,
    process.env.NEXT_PUBLIC_BSC_RPC_URL,
  ]
    .map((s) => (s || "").trim())
    .filter(Boolean);

  const preferred = env.filter((u) => !PUBLICNODE.test(u));
  const publicnodeEnv = env.filter((u) => PUBLICNODE.test(u));
  const list = [...preferred, ...SEEDS, ...publicnodeEnv];
  return [...new Set(list)];
}

/**
 * Ordered RPCs for eth_getLogs. Prefers LEADERBOARD_LOGS_RPC / BSC_LOGS_RPC,
 * then logs-capable public endpoints; falls back to general candidates last.
 */
export function serverBscLogsRpcCandidates(): string[] {
  const env = [
    process.env.LEADERBOARD_LOGS_RPC,
    process.env.BSC_LOGS_RPC,
    process.env.BSC_RPC_URL,
    process.env.NEXT_PUBLIC_BSC_RPC_URL,
  ]
    .map((s) => (s || "").trim())
    .filter(Boolean);

  const list = [...env, ...LOGS_SEEDS, ...serverBscRpcCandidates()];
  return [...new Set(list)];
}

export function serverBscRpcUrl(): string {
  return serverBscRpcCandidates()[0] || SEEDS[0];
}
