import { type Address, zeroAddress } from "viem";

/** BSC mainnet UMplan — owner-confirmed project token (external, not minted by this dApp). */
export const UMPLAN_MAINNET = "0xad09D287327C383283820CfCEe7AC0e6C7De7777" as const satisfies Address;

/** BSC mainnet Binance-Peg USDT (18 decimals). */
export const USDT_MAINNET = "0x55d398326f99059fF775485246999027B3197955" as const satisfies Address;

function addr(envValue: string | undefined, fallback: Address = zeroAddress): Address {
  if (envValue && envValue.startsWith("0x") && envValue.length === 42) return envValue as Address;
  return fallback;
}

/**
 * Contract addresses. Token defaults to mainnet UMplan so the project asset is always wired;
 * Sale/Stake/etc. still require deploy + NEXT_PUBLIC_* for a full dApp.
 */
export const addresses = {
  token: addr(process.env.NEXT_PUBLIC_TOKEN_ADDRESS, UMPLAN_MAINNET),
  usdt: addr(process.env.NEXT_PUBLIC_USDT_ADDRESS, USDT_MAINNET),
  registry: addr(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS),
  sale: addr(process.env.NEXT_PUBLIC_SALE_ADDRESS),
  milestones: addr(process.env.NEXT_PUBLIC_MILESTONES_ADDRESS),
  stake: addr(process.env.NEXT_PUBLIC_STAKE_ADDRESS),
  shareholder: addr(process.env.NEXT_PUBLIC_SHAREHOLDER_ADDRESS),
  treasury: addr(process.env.NEXT_PUBLIC_TREASURY_ADDRESS),
} as const;

/** True when module contracts are configured (token/USDT may already default to mainnet). */
export const isConfigured =
  addresses.registry !== zeroAddress &&
  addresses.sale !== zeroAddress &&
  addresses.milestones !== zeroAddress &&
  addresses.stake !== zeroAddress &&
  addresses.shareholder !== zeroAddress &&
  addresses.treasury !== zeroAddress;
