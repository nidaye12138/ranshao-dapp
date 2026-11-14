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
import {
  cacheToBuyEdges,
  loadBuyCache,
  mergeBuyCache,
  saveBuyCache,
  type CachedBuy,
} from "@/lib/api/leaderboardBuysCache";
import { serverBscLogsRpcCandidates, serverBscRpcCandidates } from "@/lib/api/serverBscRpc";
import { SWAP_HOP_START_BLOCK } from "@/lib/api/swapHistory";
import TreeAbi from "@/lib/abi/ReferralTree.json";

export { rankDirectsFromBinds } from "@/lib/api/leaderboardRank";
export type { BindEdge, BuyEdge } from "@/lib/api/leaderboardRank";

/** Deploy block of ReferralTree `0xa1a08c…` on BSC (modules deploy tx). */
export const TREE_START_BLOCK = 133_139_300n;

/** Mainnet admin / constructor root — also overridable via LEADERBOARD_ROOTS. */
export const DEFAULT_LEADERBOARD_ROOT = "0x1e403807bA07c1f45C08e080AF3c53C2385825Db" as Address;

/** 48.club / similar: eth_getLogs max ~5000 blocks. */
const LOGS_SPAN = 5_000n;
/** Keep /api/leaderboard under CF/nginx budgets while catching up the buy cache. */
const BUY_SCAN_BUDGET_MS = 8_000;

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

function treeBuyers(binds: BindEdge[]): Address[] {
  const set = new Set<string>();
  for (const b of binds) {
    set.add(getAddress(b.user).toLowerCase());
    set.add(getAddress(b.referrer).toLowerCase());
  }
  for (const a of parseRootsEnv()) set.add(a.toLowerCase());
  set.add(DEFAULT_LEADERBOARD_ROOT.toLowerCase());
  return [...set].map((a) => getAddress(a));
}

function makeClient(rpc: string, timeoutMs = 20_000) {
  return createPublicClient({
    chain: bsc,
    transport: http(rpc, { timeout: timeoutMs }),
  });
}

function pushBoughtLogs(
  out: CachedBuy[],
  logs: Awaited<ReturnType<PublicClient["getLogs"]>>,
  swap: Address,
  buyerFilter: Set<string> | null,
): void {
  for (const log of logs) {
    const who = topicAddress(log.topics[1]);
    if (!who) continue;
    const key = who.toLowerCase();
    if (buyerFilter && !buyerFilter.has(key)) continue;
    const delivered = wordUint(log.data, 3);
    if (delivered <= 0n) continue;
    out.push({
      buyer: key,
      tokenAmount: delivered.toString(),
      block: Number(log.blockNumber ?? 0),
      tx: log.transactionHash,
      swap: swap.toLowerCase(),
    });
  }
}

/**
 * Bought logs in ≤5k windows; stops at deadline (no throw).
 * Small ranges: unscoped per swap (filter to tree). Wide backfill: buyer-scoped.
 */
async function collectBuysIncremental(
  client: PublicClient,
  buyers: Address[],
  fromBlock: bigint,
  toBlock: bigint,
  deadlineMs: number,
  swaps: Address[] = SWAP_LOG_ADDRESSES,
): Promise<{ buys: CachedBuy[]; reached: bigint }> {
  const out: CachedBuy[] = [];
  let cursor = fromBlock;
  if (fromBlock > toBlock) return { buys: out, reached: toBlock };

  const buyerSet = new Set(buyers.map((b) => b.toLowerCase()));

  while (cursor <= toBlock) {
    if (Date.now() > deadlineMs) break;
    const end = cursor + LOGS_SPAN - 1n > toBlock ? toBlock : cursor + LOGS_SPAN - 1n;

    for (const swap of swaps) {
      if (Date.now() > deadlineMs) break;
      try {
        // Unscoped ≤5k window, filter to referral-tree wallets (avoids N×buyer RPC fan-out).
        const part = await client.getLogs({
          address: swap,
          event: boughtEvent,
          fromBlock: cursor,
          toBlock: end,
        });
        pushBoughtLogs(out, part, swap, buyerSet.size ? buyerSet : null);
      } catch {
        /* skip window — dataseed/public limits; try next swap/RPC */
      }
    }

    cursor = end + 1n;
  }

  const reached = cursor > fromBlock ? cursor - 1n : fromBlock - 1n;
  return { buys: out, reached: reached < fromBlock - 1n ? fromBlock - 1n : reached };
}

/**
 * Umbrella volume = 伞下买入币量 (Bought.tokenAmountDelivered), up to 9 layers, exclude self.
 * Uses disk cache + buyer-scoped chunked getLogs on logs-capable RPCs (no wide unbound scans).
 */
async function fetchBuysForTree(binds: BindEdge[]): Promise<BuyEdge[]> {
  const disk = loadBuyCache();
  let merged = disk;
  const buyers = treeBuyers(binds);

  const logsRpcs = serverBscLogsRpcCandidates();
  const deadline = Date.now() + BUY_SCAN_BUDGET_MS;
  let tip = 0n;

  for (const rpc of logsRpcs) {
    if (Date.now() > deadline) break;
    try {
      const client = makeClient(rpc, 18_000);
      tip = await client.getBlockNumber();
      const hopFrom = SWAP_HOP_START_BLOCK > tip ? tip : SWAP_HOP_START_BLOCK;
      const cachedTo = BigInt(Math.max(0, disk.scannedTo));
      // Rescan a small overlap so late-indexed logs are not missed.
      const resume =
        cachedTo > 0n ? (cachedTo > 64n ? cachedTo - 64n : 0n) : hopFrom;
      const from = resume > hopFrom ? resume : hopFrom;
      if (from > tip) {
        merged = mergeBuyCache(merged, [], Number(tip));
        break;
      }
      // Cold cache: all SwapFacades. Warm catch-up: live swap only (≤5k windows).
      const live = SWAP_LOG_ADDRESSES[0];
      const swaps =
        cachedTo > 0n && live ? [live] : SWAP_LOG_ADDRESSES;
      const { buys, reached } = await collectBuysIncremental(
        client,
        buyers,
        from,
        tip,
        deadline,
        swaps,
      );
      const scannedTo = reached >= from ? Number(reached) : Number(from > 0n ? from - 1n : 0n);
      // Only advance scannedTo when we made progress toward tip (or already caught up).
      const nextScanned =
        scannedTo >= disk.scannedTo || buys.length > 0
          ? Math.max(disk.scannedTo, Math.min(scannedTo, Number(tip)))
          : disk.scannedTo;
      merged = mergeBuyCache(merged, buys, nextScanned);
      if (buys.length > 0 || nextScanned >= Number(tip) - 1) break;
    } catch {
      continue;
    }
  }

  if (merged.buys !== disk.buys || merged.scannedTo !== disk.scannedTo) {
    try {
      saveBuyCache(merged);
    } catch {
      /* cache optional */
    }
  }

  return cacheToBuyEdges(merged);
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
      try {
        buys = await fetchBuysForTree(binds);
      } catch {
        buys = cacheToBuyEdges(loadBuyCache());
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
