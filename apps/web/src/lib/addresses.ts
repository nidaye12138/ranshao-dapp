import { getAddress, isAddress, type Address, zeroAddress } from "viem";
import { bsc } from "viem/chains";
import { appChainId } from "@/lib/chain";

/** BSC mainnet UMplan — owner-confirmed project token (external, not minted by this dApp). */
export const UMPLAN_MAINNET = getAddress("0xad09d287327c383283820cfcee7ac0e6c7de7777");

/** BSC mainnet SPCXB — SpaceX US-stock tokenization (dividend pool asset, ≠ UMplan). */
export const SPCXB_MAINNET = getAddress("0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1");

/** BSC mainnet Binance-Peg USDT (18 decimals). */
export const USDT_MAINNET = getAddress("0x55d398326f99059ff775485246999027b3197955");

/** Live SwapFacade (sell no-reward / buy 0.5% UMplan) — EIP-55 checksummed. */
export const SWAP_MAINNET = getAddress("0x7a853364f4addb839fdaddfdf080a939b1275fbf");

/**
 * Normalize env / hardcoded hex to EIP-55. Viem rejects mixed-case bad checksums
 * (e.g. NEXT_PUBLIC_SWAP_ADDRESS=0x7a853364f4AddB…FbF → "Address is invalid").
 */
function addr(envValue: string | undefined, fallback: Address = zeroAddress): Address {
  const raw = (envValue || "").trim();
  if (raw && isAddress(raw, { strict: false })) {
    try {
      return getAddress(raw);
    } catch {
      /* fall through */
    }
  }
  return fallback;
}

const mainnetFallbacks = appChainId === bsc.id;

/**
 * UM-plan module addresses.
 * On mainnet (CHAIN_ID=56), token/SPCXB/USDT may fall back to known mainnet addresses.
 * On Chapel / local, require NEXT_PUBLIC_* so we never approve/read against mainnet tokens by mistake.
 */
export const addresses = {
  token: addr(process.env.NEXT_PUBLIC_TOKEN_ADDRESS, mainnetFallbacks ? UMPLAN_MAINNET : zeroAddress),
  spcxb: addr(process.env.NEXT_PUBLIC_SPCXB_ADDRESS, mainnetFallbacks ? SPCXB_MAINNET : zeroAddress),
  usdt: addr(process.env.NEXT_PUBLIC_USDT_ADDRESS, mainnetFallbacks ? USDT_MAINNET : zeroAddress),
  registry: addr(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS), // ReferralTree
  swap: addr(process.env.NEXT_PUBLIC_SWAP_ADDRESS, mainnetFallbacks ? SWAP_MAINNET : zeroAddress),
  burn: addr(process.env.NEXT_PUBLIC_BURN_ADDRESS),
  dividends: addr(process.env.NEXT_PUBLIC_DIVIDENDS_ADDRESS),
  shareholders: addr(process.env.NEXT_PUBLIC_SHAREHOLDER_ADDRESS),
  elite: addr(process.env.NEXT_PUBLIC_ELITE_ADDRESS),
  precip: addr(process.env.NEXT_PUBLIC_PRECIP_ADDRESS),
  treasury: addr(process.env.NEXT_PUBLIC_TREASURY_ADDRESS),
} as const;

/** True when core 4-tab MVP modules are configured. */
export const isConfigured =
  addresses.token !== zeroAddress &&
  addresses.registry !== zeroAddress &&
  addresses.swap !== zeroAddress &&
  addresses.burn !== zeroAddress &&
  addresses.dividends !== zeroAddress &&
  addresses.treasury !== zeroAddress;
