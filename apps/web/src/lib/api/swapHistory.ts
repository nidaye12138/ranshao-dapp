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
import type { EarningsRow } from "@/lib/api/types";
import SwapAbi from "@/lib/abi/SwapFacade.json";

/** Deploy block of live USDT-hop SwapFacade (sell no-reward) on BSC. */
export const SWAP_HOP_START_BLOCK = 133_317_567n;

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
  source: "chain";
  address: string;
  buyVolumeUsdt: string;
  selfRewardTotal: string;
  rows: SwapHistoryRow[];
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

function rpcCandidates(): string[] {
  const env = (process.env.BSC_RPC_URL || process.env.NEXT_PUBLIC_BSC_RPC_URL || "").trim();
  const list = [
    env && !/bsc-dataseed/i.test(env) ? env : "",
    "https://bsc-rpc.publicnode.com",
    "https://bsc-dataseed1.bnbchain.org",
    "https://bsc-dataseed2.bnbchain.org",
    "https://bsc-dataseed1.defibit.io",
    "https://bsc-dataseed.binance.org",
  ].filter(Boolean);
  return [...new Set(list)];
}

function explorerTx(hash: Hex): string {
  return `https://bscscan.com/tx/${hash}`;
}

function fmtAmt(raw: bigint, symbol: string): string {
  return formatTokenRaw(raw, symbol, 18);
}

async function getLogsChunked(
  client: PublicClient,
  params: {
    address: Address | Address[];
    event: typeof boughtEvent | typeof soldEvent;
    args: Record<string, unknown>;
    fromBlock: bigint;
    toBlock: bigint;
  },
): Promise<Log[]> {
  /** BSC public RPCs often reject wide eth_getLogs — keep chunks small + degrade. */
  let span = 1_000n;
  const out: Log[] = [];
  let start = params.fromBlock;
  while (start <= params.toBlock) {
    const end = start + span > params.toBlock ? params.toBlock : start + span;
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
      if (span > 200n) {
        span = span / 2n;
        continue;
      }
      // Skip this micro-window rather than failing the whole history.
      start = end + 1n;
    }
  }
  return out;
}

function decodeBought(log: Log): Omit<SwapHistoryRow, "at"> | null {
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
    // Buy instant is referrer 0.5%; buyerReward may be 0 on live facade.
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
    };
  } catch {
    return null;
  }
}

function decodeSold(log: Log): Omit<SwapHistoryRow, "at"> | null {
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
    };
  } catch {
    return null;
  }
}

async function clientForRpc(url: string): Promise<PublicClient> {
  return createPublicClient({
    chain: bsc,
    transport: http(url, { timeout: 20_000, retryCount: 1 }),
  });
}

/** Read Bought/Sold for one wallet (live + prior SwapFacades; resilient getLogs). */
export async function fetchSwapHistory(address: string): Promise<SwapHistoryResponse | { error: string }> {
  const addr = address.toLowerCase();
  if (!isAddress(addr, { strict: false })) return { error: "address required" };

  const targets = swapLogAddresses();
  if (!targets.length) return { error: "swap unconfigured" };

  const checksummed = getAddress(addr);
  let lastErr: unknown;

  for (const rpc of rpcCandidates()) {
    try {
      const client = await clientForRpc(rpc);
      const latest = await client.getBlockNumber();
      const fromBlock = SWAP_HOP_START_BLOCK > latest ? 0n : SWAP_HOP_START_BLOCK;

      const [buyLogs, sellLogs] = await Promise.all([
        getLogsChunked(client, {
          address: targets,
          event: boughtEvent,
          args: { buyer: checksummed },
          fromBlock,
          toBlock: latest,
        }),
        getLogsChunked(client, {
          address: targets,
          event: soldEvent,
          args: { seller: checksummed },
          fromBlock,
          toBlock: latest,
        }),
      ]);

      const blockTs = new Map<string, bigint>();
      const needBlocks = [...new Set([...buyLogs, ...sellLogs].map((l) => (l.blockNumber ?? 0n).toString()))];
      await Promise.all(
        needBlocks.slice(0, 40).map(async (bn) => {
          try {
            const b = await client.getBlock({ blockNumber: BigInt(bn) });
            blockTs.set(bn, b.timestamp);
          } catch {
            /* ignore */
          }
        }),
      );

      const rows: SwapHistoryRow[] = [];
      let buyVol = 0n;
      let rewardSum = 0n;
      const seen = new Set<string>();

      for (const log of buyLogs) {
        const row = decodeBought(log);
        if (!row || seen.has(row.id)) continue;
        seen.add(row.id);
        const ts = blockTs.get(row.blockNumber);
        rows.push({ ...row, at: ts != null ? tsToLocal(Number(ts)) : "—" });
        try {
          const pay = decodeEventLog({ abi: SwapAbi, data: log.data, topics: log.topics }).args as {
            paymentAmount?: bigint;
            buyerReward?: bigint;
            referrerReward?: bigint;
          };
          buyVol += pay.paymentAmount ?? 0n;
          rewardSum += pay.buyerReward ?? pay.referrerReward ?? 0n;
        } catch {
          /* ignore */
        }
      }
      for (const log of sellLogs) {
        const row = decodeSold(log);
        if (!row || seen.has(row.id)) continue;
        seen.add(row.id);
        const ts = blockTs.get(row.blockNumber);
        rows.push({ ...row, at: ts != null ? tsToLocal(Number(ts)) : "—" });
      }

      rows.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));

      return {
        source: "chain",
        address: addr,
        buyVolumeUsdt: formatUnits(buyVol, 18),
        selfRewardTotal: formatTokenRaw(rewardSum, "UMplan"),
        rows: rows.slice(0, 50),
      };
    } catch (e) {
      lastErr = e;
    }
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
