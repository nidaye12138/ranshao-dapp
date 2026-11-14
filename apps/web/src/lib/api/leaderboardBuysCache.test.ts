import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cacheToBuyEdges, mergeBuyCache } from "./leaderboardBuysCache.ts";

describe("leaderboardBuysCache", () => {
  it("merges by tx and advances scannedTo", () => {
    const a = {
      scannedTo: 100,
      buys: [{ buyer: "0xaaa", tokenAmount: "1", block: 50, tx: "0x1" }],
    };
    const merged = mergeBuyCache(
      a,
      [
        { buyer: "0xAAA", tokenAmount: "1", block: 50, tx: "0x1" },
        { buyer: "0xbbb", tokenAmount: "2", block: 120, tx: "0x2" },
      ],
      200,
    );
    assert.equal(merged.scannedTo, 200);
    assert.equal(merged.buys.length, 2);
    const edges = cacheToBuyEdges(merged);
    assert.equal(edges.length, 2);
    assert.equal(edges.find((e) => e.buyer === "0xbbb")?.tokenAmount, 2n);
  });
});
