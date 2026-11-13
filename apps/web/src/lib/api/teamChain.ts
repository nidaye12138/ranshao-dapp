import { createPublicClient, http, type Address } from "viem";
import { bsc } from "viem/chains";
import { addresses } from "@/lib/addresses";
import TreeAbi from "@/lib/abi/ReferralTree.json";

function rpcUrl(): string {
  const fromEnv = (process.env.BSC_RPC_URL || process.env.NEXT_PUBLIC_BSC_RPC_URL || "").trim();
  if (fromEnv && !/bsc-dataseed/i.test(fromEnv)) return fromEnv;
  return "https://bsc-rpc.publicnode.com";
}

/** On-chain direct count when GRAPH_URL is missing. Indirects stay 0 without a walk index. */
export async function fetchTeamDirectsFromChain(address: Address): Promise<{
  directs: number;
  error?: string;
}> {
  if (!addresses.registry || addresses.registry === "0x0000000000000000000000000000000000000000") {
    return { directs: 0, error: "registry unconfigured" };
  }
  try {
    const client = createPublicClient({
      chain: bsc,
      transport: http(rpcUrl(), { timeout: 15_000 }),
    });
    const n = (await client.readContract({
      address: addresses.registry,
      abi: TreeAbi,
      functionName: "directRefCount",
      args: [address],
    })) as bigint;
    return { directs: Number(n) };
  } catch (e) {
    return { directs: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
