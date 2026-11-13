import { createPublicClient, http, parseAbiItem, type Address, type Hex } from "viem";
import { bsc } from "viem/chains";
import { addresses } from "@/lib/addresses";
import type { LeaderboardRow } from "@/lib/api/types";
import { rankDirectsFromBinds, type BindEdge } from "@/lib/api/leaderboardRank";

export { rankDirectsFromBinds } from "@/lib/api/leaderboardRank";
export type { BindEdge } from "@/lib/api/leaderboardRank";

/** Deploy block of ReferralTree `0xa1a08c…` on BSC (modules deploy tx). */
export const TREE_START_BLOCK = 133_139_300n;

const referrerBoundEvent = parseAbiItem(
  "event ReferrerBound(address indexed user, address indexed referrer)",
);

function rpcUrl(): string {
  const fromEnv = (process.env.BSC_RPC_URL || process.env.NEXT_PUBLIC_BSC_RPC_URL || "").trim();
  if (fromEnv && !/bsc-dataseed/i.test(fromEnv)) return fromEnv;
  return "https://bsc-rpc.publicnode.com";
}

function topicAddress(topic: Hex | undefined): Address | null {
  if (!topic || topic.length < 66) return null;
  return `0x${topic.slice(26)}` as Address;
}

async function getBindsChunked(
  client: ReturnType<typeof createPublicClient>,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<BindEdge[]> {
  const span = 8_000n;
  const out: BindEdge[] = [];
  let start = fromBlock;
  while (start <= toBlock) {
    const end = start + span - 1n > toBlock ? toBlock : start + span - 1n;
    const part = await client.getLogs({
      address: addresses.registry,
      event: referrerBoundEvent,
      fromBlock: start,
      toBlock: end,
    });
    for (const log of part) {
      const user = topicAddress(log.topics[1]);
      const referrer = topicAddress(log.topics[2]);
      if (!user || !referrer) continue;
      out.push({ user, referrer });
    }
    start = end + 1n;
  }
  return out;
}

export async function fetchLeaderboardFromChain(first = 10): Promise<{
  items: LeaderboardRow[];
  error?: string;
}> {
  if (!addresses.registry || addresses.registry === "0x0000000000000000000000000000000000000000") {
    return { items: [], error: "registry unconfigured" };
  }

  const client = createPublicClient({
    chain: bsc,
    transport: http(rpcUrl(), { timeout: 20_000 }),
  });

  try {
    const latest = await client.getBlockNumber();
    const from = TREE_START_BLOCK > latest ? 0n : TREE_START_BLOCK;
    const binds = await getBindsChunked(client, from, latest);
    return { items: rankDirectsFromBinds(binds, first) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { items: [], error: msg };
  }
}
