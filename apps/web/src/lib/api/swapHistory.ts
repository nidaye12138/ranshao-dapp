import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseAbiItem,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";
import { bsc } from "viem/chains";
import { addresses } from "@/lib/addresses";
import { formatTokenRaw, tsToLocal } from "@/lib/api/graph";
import { serverBscLogsRpcCandidates } from "@/lib/api/serverBscRpc";
import type { EarningsRow } from "@/lib/api/types";
import {
  loadSwapHistoryCache,
  mergeSwapHistoryCache,
  saveSwapHistoryCache,
  type CachedSwapRow,
} from "@/lib/api/swapHistoryCache";
import SwapAbi from "@/lib/abi/SwapFacade.json";

/** Deploy block of live USDT-hop SwapFacade (sell no-reward) on BSC. */
export const SWAP_HOP_START_BLOCK = 133_317_567n;

/** 48.club / similar: eth_getLogs max ~5000 blocks. */
const LOGS_SPAN = 5_000n;
/**
 * Soft scan budget under nginx proxy_read_timeout (60s). Prefer disk cache;
 * return partial + cache when deadline hits.
 */
const SCAN_BUDGET_MS = 25_000;
/** Skip in-request catch-up when cache this fresh and lag small. */
const CACHE_FRESH_MS = 90_000;
const CATCHUP_MAX_LAG = 15_000n;
const LOGS_RPC_TIMEOUT_MS = 8_000;

const boughtEvent = parseAbiItem(
  "event Bought(address indexed buyer, address indexed paymentToken, uint256 paymentAmount, uint256 usdAmount, uint256 tokenAmountQuoted, uint256 tokenAmountDelivered, uint256 buyerReward, uint256 referrerReward)",
);
const soldEvent = parseAbiItem(
  "event Sold(address indexed seller, address indexed paymentToken, uint256 tokenAmount, uint256 paymentQuoted, uint256 paymentDelivered, uint256 usdAmount, uint256 sellerReward, uint256 referrerReward)",
);

export const BOUGHT_TOPIC0 =
  "0xee524511e0afdb415a78a457a9fb0be80c11f2d7d2bbec13af282afd933923f9" as const;
export const SOLD_TOPIC0 =
  "0xee84864366e77ce8d7f1a48f5c756ff78d817d81f284f465448961b15b702d12" as const;

export type SwapHistoryRow = {
  id: string;
  side: "BUY" | "SELL";
  paymentAmount: string;
  tokenAmount: string;
  selfReward: string;
  txHash: Hex;
  blockNumber: string;
  at: string;
  explorerUrl: string;
};

export type SwapHistoryResponse = {
  source: "chain" | "cache";
  address: string;
  buyVolumeUsdt: string;
  selfRewardTotal: string;
  rows: SwapHistoryRow[];
  /** True when scannedTo < tip (more history may arrive on next request). */
  partial?: boolean;
  scannedTo?: number;
  tip?: number;
};

/** Live + prior SwapFacades that may hold Bought/Sold for a wallet. */
function swapLogAddresses(): Address[] {
  const raw = [
    addresses.swap,
    "0x7a853364f4addb839fdaddfdf080a939b1275fbf",
    "0x73cb0eff052034a19d40a0cdb747ef24f294681d",
    "0x7cdb95af2483b0e264355132dcb2ffccc65bc27f",
    "0xb7218002ef918139d081fdfa2eabca83d72574e5",
    "0x188cd8d1f2dd395f0779ffab1f9e7833fc17f58d",
  ];
  const out: Address[] = [];
  const seen = new Set<string>();
  for (const a of raw) {
    if (!a || !isAddress(a, { strict: false })) continue;
    const c = getAddress(a);
    const k = c.toLowerCase();
    if (k === "0x0000000000000000000000000000000000000000" || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function explorerTx(hash: Hex): string {
  return `https://bscscan.com/tx/${hash}`;
}

function fmtAmt(raw: bigint, symbol: string): string {
  return formatTokenRaw(raw, symbol, 18);
}

function makeClient(rpc: string, timeout = LOGS_RPC_TIMEOUT_MS): PublicClient {
  return createPublicClient({
    chain: bsc,
    transport: http(rpc, { timeout, retryCount: 0 }),
  });
}

/**
 * eth_getLogs in ≤5k windows; stops at deadline (no throw).
 * Returns reached = last inclusive block successfully advanced past.
 */
async function getLogsChunked(
  client: PublicClient,
  params: {
    address: Address | Address[];
    event: typeof boughtEvent | typeof soldEvent;
    args: Record<string, unknown>;
    fromBlock: bigint;
    toBlock: bigint;
    deadlineMs: number;
  },
): Promise<{ logs: Log[]; reached: bigint }> {
  const out: Log[] = [];
  let start = params.fromBlock;
  if (params.fromBlock > params.toBlock) {
    return { logs: out, reached: params.toBlock };
  }
  while (start <= params.toBlock) {
    if (Date.now() > params.deadlineMs) break;
    const end =
      start + LOGS_SPAN - 1n > params.toBlock ? params.toBlock : start + LOGS_SPAN - 1n;
    try {
      const part = await client.getLogs({
        address: params.address,
        event: params.event,
        args: params.args as never,
        fromBlock: start,
        toBlock: end,
      });
      out.push(...part);
      start = end + 1n;
    } catch {
      // Skip this window rather than failing the whole history.
      start = end + 1n;
    }
  }
  const reached = start > params.fromBlock ? start - 1n : params.fromBlock - 1n;
  return { logs: out, reached };
}

function decodeBought(log: Log): (CachedSwapRow & { paymentWei: string; rewardWei: string }) | null {
  try {
    const { args } = decodeEventLog({
      abi: SwapAbi,
      data: log.data,
      topics: log.topics,
    });
    const a = args as {
      paymentAmount?: bigint;
      tokenAmountDelivered?: bigint;
      buyerReward?: bigint;
      referrerReward?: bigint;
    };
    if (!log.transactionHash || a.paymentAmount == null) return null;
    const reward = a.buyerReward ?? a.referrerReward ?? 0n;
    return {
      id: `${log.transactionHash}-${log.logIndex}-buy`,
      side: "BUY",
      paymentAmount: fmtAmt(a.paymentAmount, "USDT"),
      tokenAmount: fmtAmt(a.tokenAmountDelivered ?? 0n, "UMplan"),
      selfReward: fmtAmt(reward, "UMplan"),
      txHash: log.transactionHash,
      blockNumber: (log.blockNumber ?? 0n).toString(),
      explorerUrl: explorerTx(log.transactionHash),
      at: "—",
      paymentWei: a.paymentAmount.toString(),
      rewardWei: reward.toString(),
    };
  } catch {
    return null;
  }
}

function decodeSold(log: Log): CachedSwapRow | null {
  try {
    const { args } = decodeEventLog({
      abi: SwapAbi,
      data: log.data,
      topics: log.topics,
    });
    const a = args as {
      tokenAmount?: bigint;
      paymentDelivered?: bigint;
      sellerReward?: bigint;
    };
    if (!log.transactionHash || a.tokenAmount == null) return null;
    return {
      id: `${log.transactionHash}-${log.logIndex}-sell`,
      side: "SELL",
      paymentAmount: fmtAmt(a.paymentDelivered ?? 0n, "USDT"),
      tokenAmount: fmtAmt(a.tokenAmount, "UMplan"),
      selfReward: fmtAmt(a.sellerReward ?? 0n, "UMplan"),
      txHash: log.transactionHash,
      blockNumber: (log.blockNumber ?? 0n).toString(),
      explorerUrl: explorerTx(log.transactionHash),
      at: "—",
      paymentWei: (a.paymentDelivered ?? 0n).toString(),
      rewardWei: (a.sellerReward ?? 0n).toString(),
    };
  } catch {
    return null;
  }
}

export type SwapHistoryOpts = {
  /** Soft deadline for chain catch-up (default SCAN_BUDGET_MS). */
  maxMs?: number;
};

function responseFromCache(
  addr: string,
  disk: ReturnType<typeof loadSwapHistoryCache>,
  tip: number,
  source: "chain" | "cache",
): SwapHistoryResponse {
  let buyWei = 0n;
  let rewardWei = 0n;
  try {
    buyWei = BigInt(disk.buyVolumeWei || "0");
    rewardWei = BigInt(disk.rewardWei || "0");
  } catch {
    /* ignore */
  }
  const rows: SwapHistoryRow[] = disk.rows
    .map((r) => ({
      id: r.id,
      side: r.side,
      paymentAmount: r.paymentAmount,
      tokenAmount: r.tokenAmount,
      selfReward: r.selfReward,
      txHash: r.txHash,
      blockNumber: r.blockNumber,
      at: r.at,
      explorerUrl: r.explorerUrl,
    }))
    .slice(0, 50);
  const partial = tip > 0 && disk.scannedTo > 0 && disk.scannedTo < tip;
  return {
    source,
    address: addr,
    buyVolumeUsdt: formatUnits(buyWei, 18),
    selfRewardTotal: formatTokenRaw(rewardWei, "UMplan"),
    rows,
    partial: partial || undefined,
    scannedTo: disk.scannedTo || undefined,
    tip: tip || undefined,
  };
}

/** Read Bought/Sold for one wallet (logs RPC + ≤5k chunks + disk cache). */
export async function fetchSwapHistory(
  address: string,
  opts?: SwapHistoryOpts,
): Promise<SwapHistoryResponse | { error: string }> {
  const addr = address.toLowerCase();
  if (!isAddress(addr, { strict: false })) return { error: "address required" };

  const targets = swapLogAddresses();
  if (!targets.length) return { error: "swap unconfigured" };

  const maxMs = opts?.maxMs ?? SCAN_BUDGET_MS;
  const deadline = Date.now() + maxMs;
  const checksummed = getAddress(addr);
  let disk = loadSwapHistoryCache(addr);
  let tipNum = 0;
  let lastErr: unknown;

  const cacheAgeMs = disk.updatedAt ? Date.now() - Date.parse(disk.updatedAt) : Infinity;
  const cacheFresh = Number.isFinite(cacheAgeMs) && cacheAgeMs < CACHE_FRESH_MS && disk.rows.length > 0;

  for (const rpc of serverBscLogsRpcCandidates()) {
    if (Date.now() > deadline) break;
    try {
      const client = makeClient(rpc, Math.min(LOGS_RPC_TIMEOUT_MS, Math.max(2_000, deadline - Date.now())));
      const latest = await client.getBlockNumber();
      tipNum = Number(latest);
      const hopFrom = SWAP_HOP_START_BLOCK > latest ? 0n : SWAP_HOP_START_BLOCK;
      const cachedTo = BigInt(Math.max(0, disk.scannedTo));
      const lag = latest > cachedTo ? latest - cachedTo : 0n;

      // Hot path: fresh cache + small tip lag → return immediately.
      if (cacheFresh && disk.scannedTo > 0 && lag <= CATCHUP_MAX_LAG && lag < LOGS_SPAN) {
        return responseFromCache(addr, disk, tipNum, "cache");
      }
      // Large lag: still catch up what budget allows; never hang to tip in one request.
      const resume = cachedTo > 0n ? (cachedTo > 64n ? cachedTo - 64n : 0n) : hopFrom;
      const from = resume > hopFrom ? resume : hopFrom;
      if (from > latest) {
        return responseFromCache(addr, disk, tipNum, disk.rows.length ? "cache" : "chain");
      }

      const [buyRes, sellRes] = await Promise.all([
        getLogsChunked(client, {
          address: targets,
          event: boughtEvent,
          args: { buyer: checksummed },
          fromBlock: from,
          toBlock: latest,
          deadlineMs: deadline,
        }),
        getLogsChunked(client, {
          address: targets,
          event: soldEvent,
          args: { seller: checksummed },
          fromBlock: from,
          toBlock: latest,
          deadlineMs: deadline,
        }),
      ]);

      const reached =
        buyRes.reached < sellRes.reached ? buyRes.reached : sellRes.reached;

      const blockTs = new Map<string, bigint>();
      const needBlocks = [
        ...new Set(
          [...buyRes.logs, ...sellRes.logs].map((l) => (l.blockNumber ?? 0n).toString()),
        ),
      ];
      await Promise.all(
        needBlocks.slice(0, 60).map(async (bn) => {
          if (Date.now() > deadline) return;
          try {
            const b = await client.getBlock({ blockNumber: BigInt(bn) });
            blockTs.set(bn, b.timestamp);
          } catch {
            /* ignore */
          }
        }),
      );

      const incoming: CachedSwapRow[] = [];
      for (const log of buyRes.logs) {
        const row = decodeBought(log);
        if (!row) continue;
        const ts = blockTs.get(row.blockNumber);
        incoming.push({ ...row, at: ts != null ? tsToLocal(Number(ts)) : "—" });
      }
      for (const log of sellRes.logs) {
        const row = decodeSold(log);
        if (!row) continue;
        const ts = blockTs.get(row.blockNumber);
        incoming.push({ ...row, at: ts != null ? tsToLocal(Number(ts)) : "—" });
      }

      const scannedTo = Number(
        reached >= from ? reached : from > 0n ? from - 1n : 0n,
      );
      const nextScanned = Math.max(disk.scannedTo, Math.min(scannedTo, tipNum));
      disk = mergeSwapHistoryCache(disk, incoming, nextScanned);
      try {
        saveSwapHistoryCache(addr, disk);
      } catch {
        /* optional disk */
      }

      return responseFromCache(addr, disk, tipNum, "chain");
    } catch (e) {
      lastErr = e;
    }
  }

  // Prefer any cached rows over hard error (partial under timeout / RPC fail).
  if (disk.rows.length > 0 || disk.scannedTo > 0) {
    return responseFromCache(addr, disk, tipNum, "cache");
  }

  return {
    error: lastErr instanceof Error ? lastErr.message : "swap history failed",
  };
}

/**
 * Map chain swap history into Mine 「Swap 推广奖励」 rows.
 * Buy-only: sells have no instant rebate — never list「卖出（无即时奖）」.
 */
export function historyToSwapPromoRows(history: SwapHistoryResponse): EarningsRow[] {
  return history.rows
    .filter((r) => r.side === "BUY")
    .map((r) => ({
      id: r.id,
      label: "买入直推奖",
      amount: r.selfReward,
      at: r.at,
    }));
}
