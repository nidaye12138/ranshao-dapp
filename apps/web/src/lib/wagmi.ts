"use client";

import { fallback, http, createConfig } from "wagmi";
import { bsc, bscTestnet, hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import {
  appChainId,
  appRpcUrl,
  publicChainEnv,
  resolveRpcUrl,
  resolveWagmiChains,
} from "@/lib/chain";

const chains = resolveWagmiChains(publicChainEnv);

const mainnetRpc = resolveRpcUrl(bsc.id, publicChainEnv);
const chapelRpc = resolveRpcUrl(bscTestnet.id, publicChainEnv);
const localRpc = resolveRpcUrl(hardhat.id, publicChainEnv);

export const config = createConfig({
  chains,
  connectors: [injected()],
  transports: {
    // Prefer env RPC, then BNB Chain seeds. Avoid relying solely on publicnode (archive-token errors on receipts).
    [bsc.id]: fallback([
      http(mainnetRpc),
      http("https://bsc-dataseed1.bnbchain.org"),
      http("https://bsc-dataseed2.bnbchain.org"),
      http("https://bsc-dataseed.binance.org"),
    ]),
    [bscTestnet.id]: http(chapelRpc),
    [hardhat.id]: http(localRpc),
  },
  ssr: true,
});

/** Configured dApp chain — use on reads/writes so MetaMask on the wrong network cannot silently hit mainnet RPC. */
export { appChainId, appRpcUrl };
