import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { bsc } from "viem/chains";
import { addresses } from "@/lib/addresses";
import type { LeaderboardRow } from "@/lib/api/types";
import { rankDirectsFromBinds, type BindEdge, type BuyEdge } from "@/lib/api/leaderboardRank";
import { serverBscRpcCandidates } from "@/lib/api/serverBscRpc";
import { SWAP_HOP_START_BLOCK } from "@/lib/api/swapHistory";
import TreeAbi from "@/lib/abi/ReferralTree.json";

export { rankDirectsFromBinds } from "@/lib/api/leaderboardRank";
export type { BindEdge, BuyEdge } from "@/lib/api/leaderboardRank";

/** Deploy block of ReferralTree `0xa1a08c…` on BSC (modules deploy tx). */
export const TREE_START_BLOCK = 133_139_300n;

/** Mainnet admin / constructor root — also overridable via LEADERBOARD_ROOTS. */
export const DEFAULT_LEADERBOARD_ROOT = "0x1e403807bA07c1f45C08e080AF3c53C2385825Db" as Address;

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

const MAX_TREE_NODES = 20_000;
const BFS_BATCH = 24;

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

function parseRootsEnv(): Address[] {
  const raw = (process.env.LEADERBOARD_ROOTS || "").trim();
  if (!raw) return [];
  const out: Address[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    if (!part || !isAddress(part, { strict: false })) continue;
    out.push(getAddress(part));
  }
  return out;
}

/**
 * Walk ReferralTree via getDirectRefs (eth_call) — avoids eth_getLogs rate limits.
 * Seeds: LEADERBOARD_ROOTS, contract owner(), DEFAULT_LEADERBOARD_ROOT.
 */
export async function fetchBindsViaTreeWalk(client: PublicClient): Promise<BindEdge[]> {
  const tree = addresses.registry as Address;
  const seeds = new Set<string>();
  for (const a of parseRootsEnv()) seeds.add(a.toLowerCase());
  try {
    const owner = (await client.readContract({
      address: tree,
      abi: TreeAbi,
      functionName: "owner",
    })) as Address;
    if (owner) seeds.add(getAddress(owner).toLowerCase());
  } catch {
    /* owner() optional if LEADERBOARD_ROOTS set */
  }
  seeds.add(DEFAULT_LEADERBOARD_ROOT.toLowerCase());

  const binds: BindEdge[] = [];
  const seen = new Set<string>(seeds);
  let queue = [...seeds].map((a) => getAddress(a));

  while (queue.length && seen.size <= MAX_TREE_NODES) {
    const batch = queue.splice(0, BFS_BATCH);
    const results = await Promise.all(
      batch.map(async (addr) => {
        const refs = (await client.readContract({
          address: tree,
          abi: TreeAbi,
          functionName: "getDirectRefs",
          args: [addr],
        })) as Address[];
        return { addr, refs };
      }),
    );
    const next: Address[] = [];
    for (const { addr, refs } of results) {
      for (const child of refs) {
        if (!child || child === "0x0000000000000000000000000000000000000000") continue;
        const childCs = getAddress(child);
        binds.push({ user: childCs, referrer: addr });
        const k = childCs.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          next.push(childCs);
        }
      }
    }
    queue = queue.concat(next);
  }
  return binds;
}

/** Soft getLogs with tiny windows + degrade; skips windows on hard failure (no throw). */
async function getLogsSoft(
  client: PublicClient,
  params: {
    address: Address;
    event: typeof boughtEvent;
    fromBlock: bigint;
    toBlock: bigint;
  },
): Promise<Awaited<ReturnType<PublicClient["getLogs"]>>> {
  let span = 500n;
  const out: Awaited<ReturnType<PublicClient["getLogs"]>> = [];
  let start = params.fromBlock;
  while (start <= params.toBlock) {
    const end = start + span - 1n > params.toBlock ? params.toBlock : start + span - 1n;
    try {
      const part = await client.getLogs({
        address: params.address,
        event: params.event,
        fromBlock: start,
        toBlock: end,
      });
      out.push(...part);
      start = end + 1n;
    } catch {
      if (span > 50n) {
        span = span / 2n;
        continue;
      }
      start = end + 1n;
    }
  }
  return out;
}

async function getBuysSoft(
  client: PublicClient,
  swap: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<BuyEdge[]> {
  const out: BuyEdge[] = [];
  try {
    const part = await getLogsSoft(client, {
      address: swap,
      event: boughtEvent,
      fromBlock,
      toBlock,
    });
    for (const log of part) {
      const buyer = topicAddress(log.topics[1]);
      if (!buyer) continue;
      const delivered = wordUint(log.data, 3);
      if (delivered <= 0n) continue;
      out.push({ buyer, tokenAmount: delivered });
    }
  } catch {
    /* umbrella optional */
  }
  return out;
}

function makeClient(rpc: string) {
  return createPublicClient({
    chain: bsc,
    transport: http(rpc, { timeout: 25_000 }),
  });
}

export async function fetchLeaderboardFromChain(first = 10): Promise<{
  items: LeaderboardRow[];
  error?: string;
  rpc?: string;
}> {
  if (!addresses.registry || addresses.registry === "0x0000000000000000000000000000000000000000") {
    return { items: [], error: "registry unconfigured" };
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { items: cache.items.slice(0, first) };
  }

  const candidates = serverBscRpcCandidates();
  let lastError = "";

  for (const rpc of candidates) {
    const client = makeClient(rpc);
    try {
      const binds = await fetchBindsViaTreeWalk(client);
      let buys: BuyEdge[] = [];
      // Optional recent Bought logs for umbrella volume — off by default (getLogs rate limits).
      if ((process.env.LEADERBOARD_BUY_LOGS || "").trim() === "1") {
        try {
          const latest = await client.getBlockNumber();
          const buyFrom = SWAP_HOP_START_BLOCK > latest ? latest : SWAP_HOP_START_BLOCK;
          const recentFrom = latest > 10_000n ? latest - 10_000n : 0n;
          const from = buyFrom > recentFrom ? buyFrom : recentFrom;
          for (const swap of SWAP_LOG_ADDRESSES) {
            buys = buys.concat(await getBuysSoft(client, swap, from, latest));
          }
        } catch {
          buys = [];
        }
      }

      const items = rankDirectsFromBinds(binds, first, buys);
      cache = { at: Date.now(), items };
      return { items, rpc };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
  }

  return { items: [], error: lastError || "all BSC RPCs failed" };
}
