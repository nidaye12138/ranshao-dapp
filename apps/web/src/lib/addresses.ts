import { type Address, zeroAddress } from "viem";

/** Fill after deploy. Local Anvil defaults can be overridden via env. */
export const addresses = {
  token: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS || zeroAddress) as Address,
  usdt: (process.env.NEXT_PUBLIC_USDT_ADDRESS || zeroAddress) as Address,
  registry: (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || zeroAddress) as Address,
  sale: (process.env.NEXT_PUBLIC_SALE_ADDRESS || zeroAddress) as Address,
  milestones: (process.env.NEXT_PUBLIC_MILESTONES_ADDRESS || zeroAddress) as Address,
  stake: (process.env.NEXT_PUBLIC_STAKE_ADDRESS || zeroAddress) as Address,
  shareholder: (process.env.NEXT_PUBLIC_SHAREHOLDER_ADDRESS || zeroAddress) as Address,
  treasury: (process.env.NEXT_PUBLIC_TREASURY_ADDRESS || zeroAddress) as Address,
} as const;

export const isConfigured = Object.values(addresses).every((a) => a !== zeroAddress);
