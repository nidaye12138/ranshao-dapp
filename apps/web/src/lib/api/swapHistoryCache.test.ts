import { describe, expect, it } from "vitest";
import { mergeSwapHistoryCache, type CachedSwapRow } from "./swapHistoryCache.ts";

describe("mergeSwapHistoryCache", () => {
  it("merges by id and recomputes buy wei totals", () => {
    const a: CachedSwapRow = {
      id: "tx1-0-buy",
      side: "BUY",
      paymentAmount: "1 USDT",
      tokenAmount: "10 UMplan",
      selfReward: "0 UMplan",
      txHash: "0x1",
      blockNumber: "100",
      at: "—",
      explorerUrl: "https://bscscan.com/tx/0x1",
      paymentWei: "1000000000000000000",
      rewardWei: "0",
    };
    const b: CachedSwapRow = {
      ...a,
      id: "tx2-0-buy",
      txHash: "0x2",
      blockNumber: "200",
      paymentWei: "2000000000000000000",
      explorerUrl: "https://bscscan.com/tx/0x2",
    };
    const merged = mergeSwapHistoryCache(
      { scannedTo: 50, buyVolumeWei: "0", rewardWei: "0", rows: [a] },
      [b, a],
      200,
    );
    expect(merged.rows).toHaveLength(2);
    expect(merged.scannedTo).toBe(200);
    expect(merged.buyVolumeWei).toBe("3000000000000000000");
    expect(merged.rows[0].blockNumber).toBe("200");
  });
});
