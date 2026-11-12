"use client";

import { http, createConfig } from "wagmi";
import { bsc, bscTestnet, hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { appChainId, appRpcUrl, resolveRpcUrl, resolveWagmiChains } from "@/lib/chain";

const chains = resolveWagmiChains(process.env);

export const config = createConfig({
  chains,
  connectors: [injected()],
  transports: {
    [bsc.id]: http(resolveRpcUrl(bsc.id, process.env)),
    [bscTestnet.id]: http(resolveRpcUrl(bscTestnet.id, process.env)),
    [hardhat.id]: http(resolveRpcUrl(hardhat.id, process.env)),
  },
  ssr: true,
});

/** Configured dApp chain — use on reads/writes so MetaMask on the wrong network cannot silently hit mainnet RPC. */
export { appChainId, appRpcUrl };
