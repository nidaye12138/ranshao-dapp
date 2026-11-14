import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateLayerPaid } from "./layerRewardsAggregate.ts";

describe("aggregateLayerPaid", () => {
  it("sums L1/L2/market and sorts newest first", () => {
    const out = aggregateLayerPaid([
      {
        id: "a",
        burner: "0x1",
        recipient: "0xr",
        layer: 1,
        amount: 50n * 10n ** 18n,
        blockNumber: 100n,
        at: "a",
      },
      {
        id: "b",
        burner: "0x2",
        recipient: "0xr",
        layer: 1,
        amount: 25n * 10n ** 18n,
        blockNumber: 200n,
        at: "b",
      },
      {
        id: "c",
        burner: "0x3",
        recipient: "0xr",
        layer: 3,
        amount: 10n * 10n ** 18n,
        blockNumber: 150n,
        at: "c",
      },
    ]);
    assert.equal(out.layerTotal.直推, "75 UMplan");
    assert.equal(out.layerTotal.间推, "0 UMplan");
    assert.equal(out.layerTotal.市场, "10 UMplan");
    assert.equal(out.layerRows[0].id, "b");
    assert.equal(out.layerRows[0].label, "直推");
    assert.equal(out.layerRows[1].id, "c");
    assert.equal(out.layerRows[1].label, "市场3");
  });
});
