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

export function serverBscRpcUrl(): string {
  return serverBscRpcCandidates()[0] || SEEDS[0];
}
