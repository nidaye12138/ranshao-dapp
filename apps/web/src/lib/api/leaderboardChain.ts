import { createPublicClient, getAddress, http, parseAbiItem, type Address, type Hex } from "viem";
import { bsc } from "viem/chains";
import { addresses } from "@/lib/addresses";
import type { LeaderboardRow } from "@/lib/api/types";
import { rankDirectsFromBinds, type BindEdge, type BuyEdge } from "@/lib/api/leaderboardRank";
import { SWAP_HOP_START_BLOCK } from "@/lib/api/swapHistory";

export { rankDirectsFromBinds } from "@/lib/api/leaderboardRank";
export type { BindEdge, BuyEdge } from "@/lib/api/leaderboardRank";

/** Deploy block of ReferralTree `0xa1a08c…` on BSC (modules deploy tx). */
export const TREE_START_BLOCK = 133_139_300n;

const referrerBoundEvent = parseAbiItem(
  "event ReferrerBound(address indexed user, address indexed referrer)",
);

const boughtEvent = parseAbiItem(
  "event Bought(address indexed buyer, address indexed paymentToken, uint256 paymentAmount, uint256 usdAmount, uint256 tokenAmountQuoted, uint256 tokenAmountDelivered, uint256 buyerReward, uint256 referrerReward)",
);

function checksum(a: string): Address {
  return getAddress(a);
}

/** Live + historical SwapFacade addresses that emit Bought (EIP-55). */
const SWAP_LOG_ADDRESSES: Address[] = [
  addresses.swap,
  checksum("0x7a853364f4addb839fdaddfdf080a939b1275fbf"),
  checksum("0x73cb0eff052034a19d40a0cdb747ef24f294681d"),
  checksum("0x7cdb95af2483b0e264355132dcb2ffccc65bc27f"),
  checksum("0xb7218002ef918139d081fdfa2eabca83d72574e5"),
  checksum("0x188cd8d1f2dd395f0779ffab1f9e7833fc17f58d"),
].filter((a, i, arr) => a && a !== "0x0000000000000000000000000000000000000000" && arr.indexOf(a) === i);

const CACHE_TTL_MS = 60_000;
let cache: { at: number; items: LeaderboardRow[] } | null = null;

function rpcUrl(): string {
  const fromEnv = (process.env.BSC_RPC_URL || process.env.NEXT_PUBLIC_BSC_RPC_URL || "").trim();
  if (fromEnv && !/bsc-dataseed/i.test(fromEnv)) return fromEnv;
  return "https://bsc-rpc.publicnode.com";
}

function topicAddress(topic: Hex | undefined): Address | null {
  if (!topic || topic.length < 66) return null;
  return `0x${topic.slice(26)}` as Address;
}

function wordUint(data: Hex, index: number): bigint {
  const start = 2 + index * 64;
  const slice = data.slice(start, start + 64);
  if (slice.length < 64) return 0n;
  return BigInt(`0x${slice}`);
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

async function getBuysChunked(
  client: ReturnType<typeof createPublicClient>,
  swap: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<BuyEdge[]> {
  const span = 8_000n;
  const out: BuyEdge[] = [];
  let start = fromBlock;
  while (start <= toBlock) {
    const end = start + span - 1n > toBlock ? toBlock : start + span - 1n;
    const part = await client.getLogs({
      address: swap,
      event: boughtEvent,
      fromBlock: start,
      toBlock: end,
    });
    for (const log of part) {
      const buyer = topicAddress(log.topics[1]);
      if (!buyer) continue;
      // Bought data words: payment, usd, quoted, delivered, buyerReward, referrerReward
      const delivered = wordUint(log.data, 3);
      if (delivered <= 0n) continue;
      out.push({ buyer, tokenAmount: delivered });
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

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { items: cache.items.slice(0, first) };
  }

  const client = createPublicClient({
    chain: bsc,
    transport: http(rpcUrl(), { timeout: 25_000 }),
  });

  try {
    const latest = await client.getBlockNumber();
    const bindFrom = TREE_START_BLOCK > latest ? 0n : TREE_START_BLOCK;
    const buyFrom = SWAP_HOP_START_BLOCK > latest ? bindFrom : SWAP_HOP_START_BLOCK;

    const binds = await getBindsChunked(client, bindFrom, latest);
    const buyLists = await Promise.all(
      SWAP_LOG_ADDRESSES.map((swap) => getBuysChunked(client, swap, buyFrom, latest)),
    );
    const buys = buyLists.flat();
    const items = rankDirectsFromBinds(binds, first, buys);
    cache = { at: Date.now(), items };
    return { items };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { items: [], error: msg };
  }
}
