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
import {
  SWAP_HOP_START_BLOCK,
  type SwapHistoryResponse,
  type SwapHistoryRow,
} from "@/lib/api/swapHistory";
import {
  loadSwapHistoryCache,
  mergeSwapHistoryCache,
  saveSwapHistoryCache,
  type CachedSwapRow,
} from "@/lib/api/swapHistoryCache";
import SwapAbi from "@/lib/abi/SwapFacade.json";

/** 48.club / similar: eth_getLogs max ~5000 blocks. */
const LOGS_SPAN = 5_000n;
/**
 * Soft scan budgets under nginx proxy_read_timeout (60s).
 * Prefer disk cache; never spend the whole request catching up a huge lag.
 */
const COLD_SCAN_BUDGET_MS = 8_000;
const CATCHUP_SCAN_BUDGET_MS = 3_500;
/** Skip catch-up when cache this fresh (ms). */
const CACHE_FRESH_MS = 90_000;
/** Tip lag above this → treat cache as fresh enough for hot path. */
const CATCHUP_MAX_LAG = 5_000n;
/** Fail fast so a hung RPC (e.g. 48.club) does not eat the whole budget. */
const LOGS_RPC_TIMEOUT_MS = 2_500;

const boughtEvent = parseAbiItem(
  "event Bought(address indexed buyer, address indexed paymentToken, uint256 paymentAmount, uint256 usdAmount, uint256 tokenAmountQuoted, uint256 tokenAmountDelivered, uint256 buyerReward, uint256 referrerReward)",
);
const soldEvent = parseAbiItem(
  "event Sold(address indexed seller, address indexed paymentToken, uint256 tokenAmount, uint256 paymentQuoted, uint256 paymentDelivered, uint256 usdAmount, uint256 sellerReward, uint256 referrerReward)",
);

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
  /** Soft deadline for chain catch-up (default cold/catch-up budgets). */
  maxMs?: number;
  /** @deprecated Ignored — scan resumes from disk cache toward tip. */
  maxBlocks?: bigint;
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

/** Read Bought/Sold for one wallet (logs RPC + ≤5k chunks + disk cache). Server-only. */
export async function fetchSwapHistory(
  address: string,
  opts?: SwapHistoryOpts,
): Promise<SwapHistoryResponse | { error: string }> {
  const addr = address.toLowerCase();
  if (!isAddress(addr, { strict: false })) return { error: "address required" };

  const targets = swapLogAddresses();
  if (!targets.length) return { error: "swap unconfigured" };

  const checksummed = getAddress(addr);
  let disk = loadSwapHistoryCache(addr);
  let tipNum = 0;
  let lastErr: unknown;

  const hasCacheProgress = disk.scannedTo > 0;
  const cacheAgeMs = disk.updatedAt ? Date.now() - Date.parse(disk.updatedAt) : Infinity;
  const cacheFresh = Number.isFinite(cacheAgeMs) && cacheAgeMs < CACHE_FRESH_MS && hasCacheProgress;
  const defaultBudget = hasCacheProgress ? CATCHUP_SCAN_BUDGET_MS : COLD_SCAN_BUDGET_MS;
  const maxMs = opts?.maxMs ?? defaultBudget;
  const deadline = Date.now() + maxMs;

  for (const rpc of serverBscLogsRpcCandidates()) {
    if (Date.now() > deadline) break;
    try {
      const client = makeClient(
        rpc,
        Math.min(LOGS_RPC_TIMEOUT_MS, Math.max(1_500, deadline - Date.now())),
      );
      const latest = await client.getBlockNumber();
      tipNum = Number(latest);
      const hopFrom = SWAP_HOP_START_BLOCK > latest ? 0n : SWAP_HOP_START_BLOCK;
      const cachedTo = BigInt(Math.max(0, disk.scannedTo));
      const lag = latest > cachedTo ? latest - cachedTo : 0n;

      // Hot path: fresh disk cache → return immediately (tip rows already merged last hit).
      // Historical backfill resumes when cache ages past CACHE_FRESH_MS.
      if (cacheFresh) {
        return responseFromCache(addr, disk, tipNum, "cache");
      }
      // Stale / cold: tip window + short forward fill under budget, then partial/cache.

      const resume = cachedTo > 0n ? (cachedTo > 64n ? cachedTo - 64n : 0n) : hopFrom;
      const histFrom = resume > hopFrom ? resume : hopFrom;

      const incoming: CachedSwapRow[] = [];
      const blockTs = new Map<string, bigint>();

      const ingest = async (logs: Log[]) => {
        const need = [...new Set(logs.map((l) => (l.blockNumber ?? 0n).toString()))];
        await Promise.all(
          need.slice(0, 40).map(async (bn) => {
            if (blockTs.has(bn) || Date.now() > deadline) return;
            try {
              const b = await client.getBlock({ blockNumber: BigInt(bn) });
              blockTs.set(bn, b.timestamp);
            } catch {
              /* ignore */
            }
          }),
        );
        for (const log of logs) {
          const row = decodeBought(log) || decodeSold(log);
          if (!row) continue;
          // decodeBought/Sold are side-specific — try both above; Sold won't match Bought topic.
          const ts = blockTs.get(row.blockNumber);
          incoming.push({ ...row, at: ts != null ? tsToLocal(Number(ts)) : "—" });
        }
      };

      // 1) Tip window first so recent swaps show up without waiting for full history backfill.
      const tipFrom = latest > LOGS_SPAN ? latest - LOGS_SPAN + 1n : hopFrom;
      if (Date.now() < deadline) {
        const [tipBuy, tipSell] = await Promise.all([
          getLogsChunked(client, {
            address: targets,
            event: boughtEvent,
            args: { buyer: checksummed },
            fromBlock: tipFrom,
            toBlock: latest,
            deadlineMs: deadline,
          }),
          getLogsChunked(client, {
            address: targets,
            event: soldEvent,
            args: { seller: checksummed },
            fromBlock: tipFrom,
            toBlock: latest,
            deadlineMs: deadline,
          }),
        ]);
        await ingest(tipBuy.logs);
        await ingest(tipSell.logs);
      }

      // 2) Forward history fill from cached cursor (when lag is contiguous / budget remains).
      let nextScanned = disk.scannedTo;
      if (histFrom <= latest && Date.now() < deadline && lag > 0n) {
        // Cap this request's forward fill so we stay under budget.
        const histTo =
          histFrom + LOGS_SPAN * 2n > latest ? latest : histFrom + LOGS_SPAN * 2n - 1n;
        const [buyRes, sellRes] = await Promise.all([
          getLogsChunked(client, {
            address: targets,
            event: boughtEvent,
            args: { buyer: checksummed },
            fromBlock: histFrom,
            toBlock: histTo,
            deadlineMs: deadline,
          }),
          getLogsChunked(client, {
            address: targets,
            event: soldEvent,
            args: { seller: checksummed },
            fromBlock: histFrom,
            toBlock: histTo,
            deadlineMs: deadline,
          }),
        ]);
        await ingest(buyRes.logs);
        await ingest(sellRes.logs);
        const reached =
          buyRes.reached < sellRes.reached ? buyRes.reached : sellRes.reached;
        const scannedTo = Number(
          reached >= histFrom ? reached : histFrom > 0n ? histFrom - 1n : 0n,
        );
        nextScanned = Math.max(disk.scannedTo, Math.min(scannedTo, tipNum));
      }

      // Tip rows are merged even when scannedTo still trails tip (partial=true).
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

  if (disk.rows.length > 0 || disk.scannedTo > 0) {
    return responseFromCache(addr, disk, tipNum, "cache");
  }

  return {
    error: lastErr instanceof Error ? lastErr.message : "swap history failed",
  };
}
