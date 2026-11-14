import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankDirectsFromBinds, umbrellaTokenByAncestor } from "./leaderboardRank.ts";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const U1 = "0x1111111111111111111111111111111111111111";
const U2 = "0x2222222222222222222222222222222222222222";
const U3 = "0x3333333333333333333333333333333333333333";

describe("rankDirectsFromBinds", () => {
  it("ranks by direct bind count descending", () => {
    const items = rankDirectsFromBinds(
      [
        { referrer: A, user: U1 },
        { referrer: A, user: U2 },
        { referrer: B, user: U3 },
      ],
      10,
    );
    assert.equal(items.length, 2);
    assert.equal(items[0].rank, 1);
    assert.equal(items[0].directs, 2);
    assert.equal(items[0].address, A);
    assert.equal(items[0].umbrellaToken, "0");
    assert.equal(items[1].directs, 1);
  });

  it("attributes downline buy token volume to ancestors", () => {
    const binds = [
      { referrer: A, user: U1 },
      { referrer: U1, user: U2 },
    ];
    const buys = [{ buyer: U2, tokenAmount: 5n * 10n ** 18n }];
    const um = umbrellaTokenByAncestor(binds, buys);
    assert.equal(um.get(U1), 5n * 10n ** 18n);
    assert.equal(um.get(A), 5n * 10n ** 18n);
    assert.equal(um.has(U2), false);

    const items = rankDirectsFromBinds(binds, 10, buys);
    const rowA = items.find((r) => r.address === A)!;
    const rowU1 = items.find((r) => r.address === U1)!;
    assert.equal(rowA.umbrellaToken, "5");
    assert.equal(rowU1.umbrellaToken, "5");
  });

  it("does not count self buys as umbrella", () => {
    const binds = [{ referrer: A, user: U1 }];
    const buys = [{ buyer: A, tokenAmount: 100n * 10n ** 18n }];
    const items = rankDirectsFromBinds(binds, 10, buys);
    assert.equal(items[0].umbrellaToken, "0");
  });

  it("respects top-N limit", () => {
    const binds = Array.from({ length: 5 }, (_, i) => ({
      referrer: `0x${(i + 1).toString(16).padStart(40, "0")}`,
      user: `0x${(i + 10).toString(16).padStart(40, "0")}`,
    }));
    assert.equal(rankDirectsFromBinds(binds, 3).length, 3);
  });
});
