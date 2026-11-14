import { bsc, bscTestnet, hardhat, type Chain } from "viem/chains";

export type AppChainId = typeof bsc.id | typeof bscTestnet.id | typeof hardhat.id;

export type ChainEnv = {
  NEXT_PUBLIC_CHAIN_ID?: string;
  NEXT_PUBLIC_BSC_RPC_URL?: string;
  NEXT_PUBLIC_BSC_TESTNET_RPC_URL?: string;
  FORCE_TESTNET?: string;
  [key: string]: string | undefined;
};

/** Prefer BNB Chain public seeds — publicnode often returns -32602 "Archive requests require a personal token" for receipt polls. */
const DEFAULT_MAINNET_RPC = "https://bsc-dataseed1.bnbchain.org";
const DEFAULT_CHAPEL_RPC = "https://bsc-testnet-rpc.publicnode.com";
const DEFAULT_LOCAL_RPC = "http://127.0.0.1:8545";

/**
 * Resolve the dApp's single configured chain.
 * Defaults to BSC Chapel (97) so local/testnet deploys are not silently routed
 * to mainnet public RPCs (bsc-dataseed). Set NEXT_PUBLIC_CHAIN_ID=56 for mainnet.
 */
export function resolveAppChainId(env: ChainEnv = {}): AppChainId {
  const raw = (env.NEXT_PUBLIC_CHAIN_ID ?? "").trim();
  if (raw === "56") return bsc.id;
  if (raw === "97") return bscTestnet.id;
  if (raw === "31337") return hardhat.id;
  if (env.FORCE_TESTNET === "1" || env.FORCE_TESTNET === "true") return bscTestnet.id;
  // Prefer Chapel when only the testnet RPC is configured (common local setup).
  if (!raw && env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL && !env.NEXT_PUBLIC_BSC_RPC_URL) {
    return bscTestnet.id;
  }
  // Safe default for current Chapel testing; mainnet must set CHAIN_ID=56 explicitly.
  return bscTestnet.id;
}

export function resolveAppChain(env: ChainEnv = {}): Chain {
  const id = resolveAppChainId(env);
  if (id === bsc.id) return bsc;
  if (id === hardhat.id) return hardhat;
  return bscTestnet;
}

export function resolveRpcUrl(chainId: AppChainId, env: ChainEnv = {}): string {
  if (chainId === bsc.id) {
    return (env.NEXT_PUBLIC_BSC_RPC_URL || "").trim() || DEFAULT_MAINNET_RPC;
  }
  if (chainId === hardhat.id) {
    return DEFAULT_LOCAL_RPC;
  }
  return (env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL || "").trim() || DEFAULT_CHAPEL_RPC;
}

/** Ordered wagmi/viem chains with the configured app chain first (default connector chain). */
export function resolveWagmiChains(env: ChainEnv = {}): readonly [Chain, ...Chain[]] {
  const primary = resolveAppChain(env);
  const rest = [bscTestnet, bsc, hardhat].filter((c) => c.id !== primary.id);
  return [primary, ...rest];
}

/**
 * Next.js only inlines *static* `process.env.NEXT_PUBLIC_*` member access into the
 * client bundle. Passing whole `process.env` into helpers leaves CHAIN_ID/RPC blank
 * in the browser (defaults to Chapel 97) while addresses may still bake — balances
 * then read mainnet tokens on the wrong chain and show "—".
 */
export const publicChainEnv: ChainEnv = {
  NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
  NEXT_PUBLIC_BSC_RPC_URL: process.env.NEXT_PUBLIC_BSC_RPC_URL,
  NEXT_PUBLIC_BSC_TESTNET_RPC_URL: process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL,
  FORCE_TESTNET: process.env.FORCE_TESTNET,
};

/** Runtime values baked from process.env at module load (client + server). */
export const appChainId: AppChainId = resolveAppChainId(publicChainEnv);
export const appChain: Chain = resolveAppChain(publicChainEnv);
export const appRpcUrl: string = resolveRpcUrl(appChainId, publicChainEnv);
