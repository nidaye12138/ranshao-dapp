import { createPublicClient, getAddress, http, type Address } from "viem";
import { bsc } from "viem/chains";
import { addresses } from "@/lib/addresses";
import { serverBscRpcCandidates } from "@/lib/api/serverBscRpc";
import type { TeamDirectMember } from "@/lib/api/types";
import TreeAbi from "@/lib/abi/ReferralTree.json";

const ZERO = "0x0000000000000000000000000000000000000000";

function makeClient(rpc: string) {
  return createPublicClient({
    chain: bsc,
    transport: http(rpc, { timeout: 5_000, retryCount: 0 }),
  });
}

/** On-chain directs + member addresses via getDirectRefs (eth_call — no eth_getLogs). */
export async function fetchTeamDirectsFromChain(address: Address): Promise<{
  directs: number;
  members: TeamDirectMember[];
  error?: string;
}> {
  if (!addresses.registry || addresses.registry === ZERO) {
    return { directs: 0, members: [], error: "registry unconfigured" };
  }
  const user = getAddress(address);
  let lastError = "";
  for (const rpc of serverBscRpcCandidates()) {
    try {
      const client = makeClient(rpc);
      const refs = (await client.readContract({
        address: addresses.registry,
        abi: TreeAbi,
        functionName: "getDirectRefs",
        args: [user],
      })) as Address[];
      const members: TeamDirectMember[] = [];
      for (const raw of refs) {
        if (!raw || raw === ZERO) continue;
        members.push({ address: getAddress(raw).toLowerCase() });
      }
      return { directs: members.length, members };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { directs: 0, members: [], error: lastError || "all BSC RPCs failed" };
}
