import { type Address, zeroAddress } from "viem";

/** BSC mainnet UMplan — owner-confirmed project token (external, not minted by this dApp). */
export const UMPLAN_MAINNET = "0xad09D287327C383283820CfCEe7AC0e6C7De7777" as const satisfies Address;

/** BSC mainnet SPCXB — SpaceX US-stock tokenization (dividend pool asset, ≠ UMplan). */
export const SPCXB_MAINNET = "0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1" as const satisfies Address;

/** BSC mainnet Binance-Peg USDT (18 decimals). */
export const USDT_MAINNET = "0x55d398326f99059fF775485246999027B3197955" as const satisfies Address;

function addr(envValue: string | undefined, fallback: Address = zeroAddress): Address {
  if (envValue && envValue.startsWith("0x") && envValue.length === 42) return envValue as Address;
  return fallback;
}

/**
 * UM-plan module addresses.
 * Token / SPCXB / USDT default to mainnet; modules require deploy + NEXT_PUBLIC_*.
 */
export const addresses = {
  token: addr(process.env.NEXT_PUBLIC_TOKEN_ADDRESS, UMPLAN_MAINNET),
  spcxb: addr(process.env.NEXT_PUBLIC_SPCXB_ADDRESS, SPCXB_MAINNET),
  usdt: addr(process.env.NEXT_PUBLIC_USDT_ADDRESS, USDT_MAINNET),
  registry: addr(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS), // ReferralTree
  swap: addr(process.env.NEXT_PUBLIC_SWAP_ADDRESS),
  burn: addr(process.env.NEXT_PUBLIC_BURN_ADDRESS),
  dividends: addr(process.env.NEXT_PUBLIC_DIVIDENDS_ADDRESS),
  shareholders: addr(process.env.NEXT_PUBLIC_SHAREHOLDER_ADDRESS),
  elite: addr(process.env.NEXT_PUBLIC_ELITE_ADDRESS),
  precip: addr(process.env.NEXT_PUBLIC_PRECIP_ADDRESS),
  treasury: addr(process.env.NEXT_PUBLIC_TREASURY_ADDRESS),
} as const;

/** True when core MVP modules are configured. */
export const isConfigured =
  addresses.registry !== zeroAddress &&
  addresses.swap !== zeroAddress &&
  addresses.burn !== zeroAddress &&
  addresses.dividends !== zeroAddress &&
  addresses.shareholders !== zeroAddress &&
  addresses.treasury !== zeroAddress;
