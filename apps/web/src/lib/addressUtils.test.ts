import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAddressLoose, toChecksumAddress } from "./addressUtils.ts";

describe("addressUtils", () => {
  const lower = "0xc31d84ebd6a0e7a5edf6bfa018f215aeabef9bd2";
  const badChecksum = "0xc31D84EBd6a0e7A5EdF6BFa018f215aEaBEF9Bd2";
  const good = "0xc31D84Ebd6A0e7a5edf6BFa018f215AeabEf9Bd2";

  it("accepts lowercase and wrong EIP-55 casing", () => {
    assert.equal(isAddressLoose(lower), true);
    assert.equal(isAddressLoose(badChecksum), true);
    assert.equal(isAddressLoose("not-an-address"), false);
  });

  it("normalizes to canonical checksum", () => {
    assert.equal(toChecksumAddress(lower), good);
    assert.equal(toChecksumAddress(badChecksum), good);
    assert.equal(toChecksumAddress("nope"), null);
  });
});
