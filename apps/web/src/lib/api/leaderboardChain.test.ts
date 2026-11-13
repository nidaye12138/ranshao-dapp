import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankDirectsFromBinds } from "./leaderboardRank.ts";

describe("rankDirectsFromBinds", () => {
  it("ranks by direct bind count descending", () => {
    const items = rankDirectsFromBinds(
      [
        { referrer: "0xAaaAaaAaaAaaAaaAaaAaaAaaAaaAaaAaaAaaAaaA", user: "0x1111111111111111111111111111111111111111" },
        { referrer: "0xAaaAaaAaaAaaAaaAaaAaaAaaAaaAaaAaaAaaAaaA", user: "0x2222222222222222222222222222222222222222" },
        { referrer: "0xBbbBbbBbbBbbBbbBbbBbbBbbBbbBbbBbbBbbBbbB", user: "0x3333333333333333333333333333333333333333" },
      ],
      10,
    );
    assert.equal(items.length, 2);
    assert.equal(items[0].rank, 1);
    assert.equal(items[0].directs, 2);
    assert.equal(items[0].address.toLowerCase(), "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(items[1].rank, 2);
    assert.equal(items[1].directs, 1);
  });

  it("respects top-N limit", () => {
    const binds = Array.from({ length: 5 }, (_, i) => ({
      referrer: `0x${(i + 1).toString(16).padStart(40, "0")}`,
      user: `0x${(i + 10).toString(16).padStart(40, "0")}`,
    }));
    const items = rankDirectsFromBinds(binds, 3);
    assert.equal(items.length, 3);
    assert.equal(items[0].rank, 1);
  });

  it("ignores zero-address referrers", () => {
    const items = rankDirectsFromBinds(
      [{ referrer: "0x0000000000000000000000000000000000000000", user: "0x1111111111111111111111111111111111111111" }],
      10,
    );
    assert.equal(items.length, 0);
  });
});
