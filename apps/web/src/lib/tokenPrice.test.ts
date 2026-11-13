import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTokenUsd } from "./tokenPrice.ts";

describe("formatTokenUsd", () => {
  it("formats sub-cent Pancake spot with 6 decimals", () => {
    // 0.001984523488233917e18
    assert.equal(formatTokenUsd(1984523488233917n), "0.001985");
  });

  it("keeps four decimals near 0.01", () => {
    assert.equal(formatTokenUsd(10_000_000_000_000_000n), "0.0100");
  });

  it("rejects zero", () => {
    assert.equal(formatTokenUsd(0n), null);
  });
});
