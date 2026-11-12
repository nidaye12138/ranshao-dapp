import { bsc, bscTestnet, hardhat, type Chain } from "viem/chains";

export type AppChainId = typeof bsc.id | typeof bscTestnet.id | typeof hardhat.id;

export type ChainEnv = {
  NEXT_PUBLIC_CHAIN_ID?: string;
  NEXT_PUBLIC_BSC_RPC_URL?: string;
  NEXT_PUBLIC_BSC_TESTNET_RPC_URL?: string;
  FORCE_TESTNET?: string;
  [key: string]: string | undefined;
};

/** Prefer publicnode — binance dataseed is often blocked from browsers / some VPS paths. */
const DEFAULT_MAINNET_RPC = "https://bsc-rpc.publicnode.com";
const DEFAULT_CHAPEL_RPC = "https://bsc-testnet-rpc.publicnode.com";
const DEFAULT_LOCAL_RPC = "http://127.0.0.1:8545";

/**
 * Resolve the dApp's single configured chain.
 * Defaults to BSC Chapel (97) so local/testnet deploys are not silently routed
 * to mainnet. Set NEXT_PUBLIC_CHAIN_ID=56 for mainnet.
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

function withHttpRpc(chain: Chain, rpcUrl: string): Chain {
  return {
    ...chain,
    rpcUrls: {
      ...chain.rpcUrls,
      default: { http: [rpcUrl] },
    },
  };
}

export function resolveAppChain(env: ChainEnv = {}): Chain {
  const id = resolveAppChainId(env);
  const base = id === bsc.id ? bsc : id === hardhat.id ? hardhat : bscTestnet;
  return withHttpRpc(base, resolveRpcUrl(id, env));
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
  const rest = ([bscTestnet, bsc, hardhat] as const)
    .filter((c) => c.id !== primary.id)
    .map((c) => withHttpRpc(c, resolveRpcUrl(c.id as AppChainId, env)));
  return [primary, ...rest];
}

/**
 * Next.js only inlines `process.env.NEXT_PUBLIC_*` on static member access.
 * Passing bare `process.env` into helpers leaves the client with an empty object,
 * so resolveAppChainId falls through to Chapel (97) even when .env.local is 56.
 */
export const publicChainEnv: ChainEnv = {
  NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
  NEXT_PUBLIC_BSC_RPC_URL: process.env.NEXT_PUBLIC_BSC_RPC_URL,
  NEXT_PUBLIC_BSC_TESTNET_RPC_URL: process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL,
  FORCE_TESTNET: process.env.FORCE_TESTNET,
};

/** Runtime values baked from public env at module load (client + server). */
export const appChainId: AppChainId = resolveAppChainId(publicChainEnv);
export const appChain: Chain = resolveAppChain(publicChainEnv);
export const appRpcUrl: string = resolveRpcUrl(appChainId, publicChainEnv);
