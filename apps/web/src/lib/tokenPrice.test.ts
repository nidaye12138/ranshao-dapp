import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTokenUsd, spotUsdFromPoolMid } from "./tokenPrice.ts";

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

describe("spotUsdFromPoolMid", () => {
  it("prices UMplan from SPCXB mid × V3 SPCXB/USDT (not thin V2 hop)", () => {
    // Sample mainnet-shaped reserves + ~140.66 USDT per SPCXB.
    const mid = spotUsdFromPoolMid({
      reserveToken: 38_125_801_034_657_938_142_350_140n,
      reserveSpcxb: 484_287_934_441_870_005_983n,
      usdtPerSpcxb18: 140_664_373_237_693_219_320n,
    });
    assert.ok(mid && mid > 0n);
    const shown = formatTokenUsd(mid);
    assert.equal(shown, "0.001787");
    // Must not look like the broken pure-V2 quote (~0.001705).
    assert.notEqual(shown, "0.001705");
  });

  it("rejects empty reserves", () => {
    assert.equal(
      spotUsdFromPoolMid({
        reserveToken: 0n,
        reserveSpcxb: 1n,
        usdtPerSpcxb18: 1n,
      }),
      null,
    );
  });
});
