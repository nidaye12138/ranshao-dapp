import type { Address, PublicClient } from "viem";
import TreeAbi from "@/lib/abi/ReferralTree.json";
import { formatTxError } from "@/lib/txError";

type Locale = "zh" | "en";

/**
 * Simulate ReferralTree.bindReferrer before opening the wallet so Solidity
 * requires (already bound / not in tree / …) surface as clear UI copy even when
 * TokenPocket strips the revert string from eth_estimateGas.
 */
export async function preflightBindReferrer(opts: {
  client: PublicClient;
  tree: Address;
  account: Address;
  referrer: Address;
  chainId: number;
  locale?: Locale;
}): Promise<string | null> {
  try {
    await opts.client.simulateContract({
      address: opts.tree,
      abi: TreeAbi,
      functionName: "bindReferrer",
      args: [opts.referrer],
      account: opts.account,
    });
    return null;
  } catch (err) {
    return formatTxError(err, opts.locale ?? "zh", opts.chainId);
  }
}
