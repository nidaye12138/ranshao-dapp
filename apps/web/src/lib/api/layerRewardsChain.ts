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
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { addresses } from "@/lib/addresses";
import { tsToLocal } from "@/lib/api/graph";
import {
  aggregateLayerPaid,
  type LayerPaidEdge,
} from "@/lib/api/layerRewardsAggregate";
import { serverBscLogsRpcCandidates } from "@/lib/api/serverBscRpc";
import type { EarningsRow } from "@/lib/api/types";

// LayerEarningsRow is structurally compatible with EarningsRow.

/** ReferralTree / modules deploy on BSC — LayerPaid cannot predate this. */
const LAYER_START_BLOCK = 133_139_300n;

/** LayerPaid(address indexed burner, address indexed recipient, uint8 indexed layer, uint256 amount) */
const layerPaidEvent = parseAbiItem(
  "event LayerPaid(address indexed burner, address indexed recipient, uint8 indexed layer, uint256 amount)",
);

const LOGS_SPAN = 5_000n;
const SCAN_BUDGET_MS = 8_000;
const MEM_TTL_MS = 60_000;

type CachedRow = {
  id: string;
  burner: string;
  recipient: string;
  layer: number;
  amount: string;
  block: number;
  at: string;
};

type AddrCache = {
  scannedTo: number;
  rows: CachedRow[];
  updatedAt?: string;
};

const mem = new Map<string, { at: number; payload: ReturnType<typeof aggregateLayerPaid> }>();

function cachePath(address: string): string {
  const base = (process.env.LAYER_PAID_CACHE_DIR || "").trim() || "/var/tmp";
  return `${base}/umplan-layer-paid-${address.toLowerCase()}.json`;
}

function loadCache(address: string): AddrCache {
  try {
    const raw = readFileSync(cachePath(address), "utf8");
    const parsed = JSON.parse(raw) as AddrCache;
    if (!parsed || !Array.isArray(parsed.rows)) return { scannedTo: 0, rows: [] };
    return {
      scannedTo: Number(parsed.scannedTo) || 0,
      rows: parsed.rows.filter((r) => r && r.amount && r.id),
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return { scannedTo: 0, rows: [] };
  }
}

function saveCache(address: string, cache: AddrCache): void {
  const path = cachePath(address);
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    /* ok */
  }
  const body = JSON.stringify({ ...cache, updatedAt: new Date().toISOString() }, null, 2);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf8");
  renameSync(tmp, path);
}

function mergeCache(prev: AddrCache, incoming: CachedRow[], scannedTo: number): AddrCache {
  const map = new Map<string, CachedRow>();
  for (const r of [...prev.rows, ...incoming]) {
    map.set(r.id, r);
  }
  return {
    scannedTo: Math.max(prev.scannedTo || 0, scannedTo),
    rows: [...map.values()],
  };
}

function topicAddress(topic: Hex | undefined): Address | null {
  if (!topic || topic.length < 66) return null;
  return `0x${topic.slice(26)}` as Address;
}

function makeClient(rpc: string) {
  return createPublicClient({
    chain: bsc,
    transport: http(rpc, { timeout: 18_000 }),
  });
}

async function scanLayerPaid(
  client: PublicClient,
  layer: Address,
  recipient: Address,
  fromBlock: bigint,
  toBlock: bigint,
  deadlineMs: number,
): Promise<{ rows: CachedRow[]; reached: bigint }> {
  const out: CachedRow[] = [];
  let cursor = fromBlock;
  if (fromBlock > toBlock) return { rows: out, reached: toBlock };

  const blockTs = new Map<string, number>();

  while (cursor <= toBlock) {
    if (Date.now() > deadlineMs) break;
    const end = cursor + LOGS_SPAN - 1n > toBlock ? toBlock : cursor + LOGS_SPAN - 1n;
    try {
      const part = await client.getLogs({
        address: layer,
        event: layerPaidEvent,
        args: { recipient },
        fromBlock: cursor,
        toBlock: end,
      });
      for (const log of part) {
        const burner = topicAddress(log.topics[1]);
        const who = topicAddress(log.topics[2]) || recipient;
        const layerTopic = log.topics[3];
        const layerNum = layerTopic ? Number(BigInt(layerTopic)) : 0;
        const amount = log.data ? BigInt(log.data) : 0n;
        if (!burner || amount <= 0n || layerNum < 1) continue;
        const bn = log.blockNumber ?? cursor;
        const bnKey = bn.toString();
        if (!blockTs.has(bnKey)) {
          try {
            const b = await client.getBlock({ blockNumber: bn });
            blockTs.set(bnKey, Number(b.timestamp));
          } catch {
            blockTs.set(bnKey, 0);
          }
        }
        const ts = blockTs.get(bnKey) || 0;
        out.push({
          id: `${log.transactionHash}-${log.logIndex}`,
          burner: burner.toLowerCase(),
          recipient: who.toLowerCase(),
          layer: layerNum,
          amount: amount.toString(),
          block: Number(bn),
          at: ts > 0 ? tsToLocal(ts) : "—",
        });
      }
    } catch {
      /* skip window */
    }
    cursor = end + 1n;
  }

  const reached = cursor > fromBlock ? cursor - 1n : fromBlock - 1n;
  return { rows: out, reached };
}

function cacheToEdges(cache: AddrCache): LayerPaidEdge[] {
  return cache.rows.map((r) => ({
    id: r.id,
    burner: r.burner,
    recipient: r.recipient,
    layer: r.layer,
    amount: BigInt(r.amount),
    blockNumber: BigInt(r.block),
    at: r.at,
  }));
}

export async function fetchLayerRewardsFromChain(address: string): Promise<{
  layerTotal: { 直推: string; 间推: string; 市场: string };
  layerRows: EarningsRow[];
  error?: string;
} | null> {
  const addr = address.toLowerCase();
  if (!isAddress(addr, { strict: false })) return null;

  const layer = addresses.layerRewards;
  if (!layer || layer === "0x0000000000000000000000000000000000000000") {
    return null;
  }

  const hit = mem.get(addr);
  if (hit && Date.now() - hit.at < MEM_TTL_MS) {
    return hit.payload;
  }

  const checksummed = getAddress(addr);
  let disk = loadCache(addr);
  const deadline = Date.now() + SCAN_BUDGET_MS;
  let lastErr = "";

  for (const rpc of serverBscLogsRpcCandidates()) {
    if (Date.now() > deadline) break;
    try {
      const client = makeClient(rpc);
      const tip = await client.getBlockNumber();
      const hopFrom = LAYER_START_BLOCK > tip ? 0n : LAYER_START_BLOCK;
      const cachedTo = BigInt(Math.max(0, disk.scannedTo));
      const resume = cachedTo > 0n ? (cachedTo > 64n ? cachedTo - 64n : 0n) : hopFrom;
      const from = resume > hopFrom ? resume : hopFrom;
      if (from <= tip) {
        const { rows, reached } = await scanLayerPaid(
          client,
          layer,
          checksummed,
          from,
          tip,
          deadline,
        );
        const scannedTo = Number(reached >= from ? reached : from > 0n ? from - 1n : 0n);
        const nextScanned = Math.max(disk.scannedTo, Math.min(scannedTo, Number(tip)));
        disk = mergeCache(disk, rows, nextScanned);
        try {
          saveCache(addr, disk);
        } catch {
          /* optional */
        }
      }
      lastErr = "";
      break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  const payload = aggregateLayerPaid(cacheToEdges(disk));
  mem.set(addr, { at: Date.now(), payload });
  if (lastErr && disk.rows.length === 0) {
    return { ...payload, error: lastErr };
  }
  return payload;
}
