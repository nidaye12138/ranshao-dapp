import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferPurchasedButtonTiers } from "./inferPurchasedTiers.ts";

describe("inferPurchasedButtonTiers", () => {
  it("marks only T1+T4 when burnedUsd=16 (jump skip 5U/8U)", () => {
    const got = inferPurchasedButtonTiers(4, 16);
    assert.deepEqual([...got].sort((a, b) => a - b), [1, 4]);
  });

  it("marks all four when burnedUsd=29", () => {
    const got = inferPurchasedButtonTiers(4, 29);
    assert.deepEqual([...got].sort((a, b) => a - b), [1, 2, 3, 4]);
  });

  it("marks only T4 when burnedUsd=15", () => {
    const got = inferPurchasedButtonTiers(4, 15);
    assert.deepEqual([...got], [4]);
  });

  it("falls back to highest when burnedUsd does not match any subset", () => {
    const got = inferPurchasedButtonTiers(4, 100);
    assert.deepEqual([...got], [4]);
  });

  it("returns empty when no button tier", () => {
    assert.equal(inferPurchasedButtonTiers(0, 16).size, 0);
  });
});
