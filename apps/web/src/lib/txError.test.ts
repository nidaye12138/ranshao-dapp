import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatTxError } from "./txError.ts";

describe("formatTxError", () => {
  it("maps insufficient funds", () => {
    const msg = formatTxError(new Error("Insufficient funds for gas * price + value"));
    assert.match(msg, /BNB 余额不足/);
  });

  it("maps unknown RPC (common zero-gas MetaMask path)", () => {
    const err = Object.assign(new Error("An unknown RPC error occurred."), {
      shortMessage: "An unknown RPC error occurred.",
      name: "UnknownRpcError",
    });
    const msg = formatTxError(err);
    // Production default chain is mainnet (56) → ask for real BNB, not Chapel faucet.
    assert.match(msg, /BNB|Gas/);
    assert.doesNotMatch(msg, /Chapel|Testnet|测试 BNB/);
  });

  it("maps tree: referrer not in tree", () => {
    const msg = formatTxError(new Error("execution reverted: tree: referrer not in tree"));
    assert.match(msg, /邀请人尚未入网/);
  });

  it("maps user reject", () => {
    const msg = formatTxError(new Error("User rejected the request."));
    assert.match(msg, /已取消/);
  });
});
