import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTxError } from "./txError.ts";

describe("formatTxError", () => {
  it("maps insufficient funds to mainnet BNB gas copy (not Testnet)", () => {
    const msg = formatTxError(new Error("Insufficient funds for gas * price + value"));
    assert.match(msg, /BNB Chain|主网|Gas/);
    assert.doesNotMatch(msg, /Testnet|Chapel|测试 BNB/);
  });

  it("maps insufficient allowance clearly", () => {
    const msg = formatTxError(new Error("execution reverted: ERC20: insufficient allowance"));
    assert.match(msg, /授权/);
    assert.doesNotMatch(msg, /Testnet|Chapel/);
  });

  it("maps unknown RPC without Chapel wording", () => {
    const err = Object.assign(new Error("An unknown RPC error occurred."), {
      shortMessage: "An unknown RPC error occurred.",
    });
    const msg = formatTxError(err);
    assert.doesNotMatch(msg, /Testnet|Chapel|测试 BNB/);
  });

  it("maps tree: referrer not in tree", () => {
    const msg = formatTxError(new Error("execution reverted: tree: referrer not in tree"));
    assert.match(msg, /邀请人|referrer/i);
  });

  it("maps user reject", () => {
    const msg = formatTxError(new Error("User rejected the request."));
    assert.match(msg, /取消|cancelled/i);
  });
});
