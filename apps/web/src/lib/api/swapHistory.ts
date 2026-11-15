import type { Hex } from "viem";
import type { EarningsRow } from "@/lib/api/types";

/** Deploy block of live USDT-hop SwapFacade (sell no-reward) on BSC. */
export const SWAP_HOP_START_BLOCK = 133_317_567n;

export const BOUGHT_TOPIC0 =
  "0xee524511e0afdb415a78a457a9fb0be80c11f2d7d2bbec13af282afd933923f9" as const;
export const SOLD_TOPIC0 =
  "0xee84864366e77ce8d7f1a48f5c756ff78d817d81f284f465448961b15b702d12" as const;

export type SwapHistoryRow = {
  id: string;
  side: "BUY" | "SELL";
  paymentAmount: string;
  tokenAmount: string;
  selfReward: string;
  txHash: Hex;
  blockNumber: string;
  at: string;
  explorerUrl: string;
};

export type SwapHistoryResponse = {
  source: "chain" | "cache";
  address: string;
  buyVolumeUsdt: string;
  selfRewardTotal: string;
  rows: SwapHistoryRow[];
  /** True when scannedTo < tip (more history may arrive on next request). */
  partial?: boolean;
  scannedTo?: number;
  tip?: number;
};

/**
 * Map chain swap history into Mine 「Swap 推广奖励」 rows.
 * Buy-only: sells have no instant rebate — never list「卖出（无即时奖）」.
 */
export function historyToSwapPromoRows(history: SwapHistoryResponse): EarningsRow[] {
  return history.rows
    .filter((r) => r.side === "BUY")
    .map((r) => ({
      id: r.id,
      label: "买入直推奖",
      amount: r.selfReward,
      at: r.at,
    }));
}
