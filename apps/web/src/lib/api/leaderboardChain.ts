import { createPublicClient, http, parseAbiItem, type Address, type Hex } from "viem";
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

/** Live + historical SwapFacade addresses that emit Bought. */
const SWAP_LOG_ADDRESSES: Address[] = [
  addresses.swap,
  "0x7a853364f4AddB839FdaDdFDf080a939b1275FbF",
  "0x73CB0efF052034a19D40A0cdb747ef24F294681D",
  "0x7cdB95aF2483B0e264355132dCb2FFcCc65BC27F",
  "0xb7218002Ef918139d081fDFa2EabCA83D72574E5",
  "0x188cD8D1f2dD395f0779FFAb1f9e7833Fc17f58D",
].filter((a, i, arr) => a && a !== "0x0000000000000000000000000000000000000000" && arr.indexOf(a) === i) as Address[];

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
