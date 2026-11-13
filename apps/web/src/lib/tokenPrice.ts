import { formatUnits, type Address } from "viem";

/** PancakeSwap V2 Router (BSC mainnet). */
export const PANCAKE_V2_ROUTER =
  "0x10ED43C718714eb63d5aA57B78B54704E256024E" as const satisfies Address;

export const PancakeRouterAbi = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

/** Format a 1e18 USD quote for homepage / stats (enough digits for sub-cent tokens). */
export function formatTokenUsd(amountUsd18: bigint): string | null {
  if (amountUsd18 <= 0n) return null;
  const n = Number(formatUnits(amountUsd18, 18));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  // Six decimals so 0.001974 vs 0.001984 stay distinguishable (Ave-style).
  return n.toFixed(6);
}
