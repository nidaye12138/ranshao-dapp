import { getAddress, isAddress, type Address } from "viem";

/** Accept checksummed or lowercase hex; reject garbage. */
export function isAddressLoose(value: string | null | undefined): boolean {
  if (!value) return false;
  return isAddress(value, { strict: false });
}

/** Normalize to EIP-55 checksum; returns null if invalid. */
export function toChecksumAddress(value: string | null | undefined): Address | null {
  if (!value || !isAddress(value, { strict: false })) return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}
