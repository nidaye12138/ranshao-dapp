import { createPublicClient, http, type Address } from "viem";
import { bsc } from "viem/chains";
import { addresses } from "@/lib/addresses";
import { serverBscRpcCandidates } from "@/lib/api/serverBscRpc";
import TreeAbi from "@/lib/abi/ReferralTree.json";

/** On-chain direct count when GRAPH_URL is missing. Indirects stay 0 without a walk index. */
export async function fetchTeamDirectsFromChain(address: Address): Promise<{
  directs: number;
  error?: string;
}> {
  if (!addresses.registry || addresses.registry === "0x0000000000000000000000000000000000000000") {
    return { directs: 0, error: "registry unconfigured" };
  }
  let lastError = "";
  for (const rpc of serverBscRpcCandidates()) {
    try {
      const client = createPublicClient({
        chain: bsc,
        transport: http(rpc, { timeout: 15_000 }),
      });
      const n = (await client.readContract({
        address: addresses.registry,
        abi: TreeAbi,
        functionName: "directRefCount",
        args: [address],
      })) as bigint;
      return { directs: Number(n) };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { directs: 0, error: lastError || "all BSC RPCs failed" };
}
