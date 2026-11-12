import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeEmbeddedErrorString, formatTxError } from "./txError.ts";

describe("formatTxError", () => {
  it("maps insufficient funds", () => {
    const msg = formatTxError(new Error("Insufficient funds for gas * price + value"), "zh", 97);
    assert.match(msg, /BNB 余额不足/);
    assert.match(msg, /Chapel|Testnet/);
  });

  it("maps insufficient funds on mainnet without Chapel tip", () => {
    const msg = formatTxError(new Error("Insufficient funds for gas * price + value"), "zh", 56);
    assert.match(msg, /BNB 余额不足/);
    assert.doesNotMatch(msg, /Chapel/);
  });

  it("maps unknown RPC (common zero-gas MetaMask path)", () => {
    const err = Object.assign(new Error("An unknown RPC error occurred."), {
      shortMessage: "An unknown RPC error occurred.",
      name: "UnknownRpcError",
    });
    const msg = formatTxError(err, "zh", 97);
    assert.match(msg, /Gas 不足|测试 BNB/);
  });

  it("maps TokenPocket estimateGas failure on mainnet", () => {
    const msg = formatTxError(new Error("合约错误，无法预估 Gas"), "zh", 56);
    assert.match(msg, /合约拒绝|已绑定/);
    assert.doesNotMatch(msg, /Chapel|Testnet/);
  });

  it("maps tree: referrer not in tree", () => {
    const msg = formatTxError(new Error("execution reverted: tree: referrer not in tree"));
    assert.match(msg, /邀请人尚未入网/);
  });

  it("maps already bound from embedded Error(string) hex", () => {
    const hex =
      "0x08c379a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000013747265653a20616c726561647920626f756e6400000000000000000000000000";
    const msg = formatTxError(new Error(`An unknown RPC error occurred. data: ${hex}`), "zh", 56);
    assert.match(msg, /已绑定推荐关系/);
  });

  it("maps user reject", () => {
    const msg = formatTxError(new Error("User rejected the request."));
    assert.match(msg, /已取消/);
  });
});

describe("decodeEmbeddedErrorString", () => {
  it("decodes tree: already bound", () => {
    const hex =
      "0x08c379a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000013747265653a20616c726561647920626f756e6400000000000000000000000000";
    assert.equal(decodeEmbeddedErrorString(hex), "tree: already bound");
  });
});
