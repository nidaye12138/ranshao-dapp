import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress, isAddress } from "viem";

describe("Swap address checksum", () => {
  const badEnv = "0x7a853364f4AddB839FdaDdFDf080a939b1275FbF";
  const good = "0x7A853364F4aDdB839FDaDDFdf080a939b1275fBF";

  it("rejects the bad mixed-case Swap string under strict isAddress", () => {
    assert.equal(isAddress(badEnv, { strict: true }), false);
    assert.equal(isAddress(badEnv, { strict: false }), true);
  });

  it("getAddress normalizes to EIP-55 accepted by viem", () => {
    assert.equal(getAddress(badEnv), good);
    assert.equal(isAddress(good, { strict: true }), true);
  });
});
