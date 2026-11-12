import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bsc, bscTestnet, hardhat } from "viem/chains";
import { resolveAppChainId, resolveRpcUrl, resolveWagmiChains } from "./chain.ts";

describe("resolveAppChainId", () => {
  it("defaults to Chapel (97), not BSC mainnet (56)", () => {
    assert.equal(resolveAppChainId({}), bscTestnet.id);
  });

  it("honors NEXT_PUBLIC_CHAIN_ID=97", () => {
    assert.equal(resolveAppChainId({ NEXT_PUBLIC_CHAIN_ID: "97" }), bscTestnet.id);
  });

  it("honors NEXT_PUBLIC_CHAIN_ID=56 for mainnet", () => {
    assert.equal(resolveAppChainId({ NEXT_PUBLIC_CHAIN_ID: "56" }), bsc.id);
  });

  it("honors NEXT_PUBLIC_CHAIN_ID=31337 for local anvil", () => {
    assert.equal(resolveAppChainId({ NEXT_PUBLIC_CHAIN_ID: "31337" }), hardhat.id);
  });

  it("uses Chapel when only testnet RPC is set", () => {
    assert.equal(
      resolveAppChainId({ NEXT_PUBLIC_BSC_TESTNET_RPC_URL: "https://example-chapel.rpc" }),
      bscTestnet.id,
    );
  });
});

describe("resolveRpcUrl", () => {
  it("does not use bsc-dataseed for Chapel", () => {
    const url = resolveRpcUrl(bscTestnet.id, {});
    assert.ok(!url.includes("bsc-dataseed.binance.org"), url);
    assert.match(url, /testnet|chapel|97/i);
  });

  it("uses NEXT_PUBLIC_BSC_TESTNET_RPC_URL for Chapel", () => {
    assert.equal(
      resolveRpcUrl(bscTestnet.id, { NEXT_PUBLIC_BSC_TESTNET_RPC_URL: "https://my-chapel.example" }),
      "https://my-chapel.example",
    );
  });

  it("uses NEXT_PUBLIC_BSC_RPC_URL for mainnet", () => {
    assert.equal(
      resolveRpcUrl(bsc.id, { NEXT_PUBLIC_BSC_RPC_URL: "https://my-bsc.example" }),
      "https://my-bsc.example",
    );
  });
});

describe("resolveWagmiChains", () => {
  it("puts Chapel first by default so wagmi does not default to mainnet", () => {
    const chains = resolveWagmiChains({});
    assert.equal(chains[0].id, bscTestnet.id);
  });

  it("puts mainnet first when CHAIN_ID=56", () => {
    const chains = resolveWagmiChains({ NEXT_PUBLIC_CHAIN_ID: "56" });
    assert.equal(chains[0].id, bsc.id);
  });
});
