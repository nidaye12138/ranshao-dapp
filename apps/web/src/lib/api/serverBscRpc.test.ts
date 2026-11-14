import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serverBscLogsRpcCandidates, serverBscRpcCandidates } from "./serverBscRpc.ts";

describe("serverBscRpcCandidates", () => {
  it("puts publicnode after non-publicnode URLs and includes bnbchain seeds", () => {
    const prevBsc = process.env.BSC_RPC_URL;
    const prevPub = process.env.NEXT_PUBLIC_BSC_RPC_URL;
    process.env.BSC_RPC_URL = "https://bsc-rpc.publicnode.com";
    process.env.NEXT_PUBLIC_BSC_RPC_URL = "https://bsc-dataseed1.bnbchain.org";
    try {
      const list = serverBscRpcCandidates();
      assert.equal(list[0], "https://bsc-dataseed1.bnbchain.org");
      const pn = list.findIndex((u) => /publicnode/i.test(u));
      assert.ok(pn > 0);
      assert.ok(list.some((u) => /bnbchain\.org/i.test(u)));
    } finally {
      if (prevBsc === undefined) delete process.env.BSC_RPC_URL;
      else process.env.BSC_RPC_URL = prevBsc;
      if (prevPub === undefined) delete process.env.NEXT_PUBLIC_BSC_RPC_URL;
      else process.env.NEXT_PUBLIC_BSC_RPC_URL = prevPub;
    }
  });

  it("prefers logs-capable RPCs for eth_getLogs", () => {
    const prev = process.env.LEADERBOARD_LOGS_RPC;
    process.env.LEADERBOARD_LOGS_RPC = "https://rpc-bsc.48.club";
    try {
      const list = serverBscLogsRpcCandidates();
      assert.equal(list[0], "https://rpc-bsc.48.club");
      assert.ok(list.some((u) => /publicnode/i.test(u)));
    } finally {
      if (prev === undefined) delete process.env.LEADERBOARD_LOGS_RPC;
      else process.env.LEADERBOARD_LOGS_RPC = prev;
    }
  });
});
