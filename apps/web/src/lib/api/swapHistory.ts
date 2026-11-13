import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  http,
  isAddress,
  parseAbiItem,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { bsc } from "viem/chains";
import { addresses } from "@/lib/addresses";
import { formatTokenRaw, tsToLocal } from "@/lib/api/graph";
import type { EarningsRow } from "@/lib/api/types";
import SwapAbi from "@/lib/abi/SwapFacade.json";

/** Deploy block of live USDT-hop SwapFacade `0x7cdB…C27F` on BSC. */
export const SWAP_HOP_START_BLOCK = 133_280_106n;

const boughtEvent = parseAbiItem(
  "event Bought(address indexed buyer, address indexed paymentToken, uint256 paymentAmount, uint256 usdAmount, uint256 tokenAmountQuoted, uint256 tokenAmountDelivered, uint256 buyerReward, uint256 referrerReward)",
);
const soldEvent = parseAbiItem(
  "event Sold(address indexed seller, address indexed paymentToken, uint256 tokenAmount, uint256 paymentQuoted, uint256 paymentDelivered, uint256 usdAmount, uint256 sellerReward, uint256 referrerReward)",
);

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

function rpcUrl(): string {
  // eth_getLogs is often rejected on bsc-dataseed*; prefer a tolerant public endpoint.
  const fromEnv = (process.env.BSC_RPC_URL || process.env.NEXT_PUBLIC_BSC_RPC_URL || "").trim();
  if (fromEnv && !/bsc-dataseed/i.test(fromEnv)) return fromEnv;
  return "https://bsc-rpc.publicnode.com";
}

async function getLogsChunked(
  client: ReturnType<typeof createPublicClient>,
  params: {
    address: Address;
    event: typeof boughtEvent | typeof soldEvent;
    args: Record<string, unknown>;
    fromBlock: bigint;
    toBlock: bigint;
  },
): Promise<Log[]> {
  const span = 4_000n;
  const out: Log[] = [];
  let start = params.fromBlock;
  while (start <= params.toBlock) {
    const end = start + span > params.toBlock ? params.toBlock : start + span;
    const part = await client.getLogs({
      address: params.address,
      event: params.event,
      args: params.args as never,
      fromBlock: start,
      toBlock: end,
    });
    out.push(...part);
    start = end + 1n;
  }
  return out;
}

function explorerTx(hash: Hex): string {
  return `https://bscscan.com/tx/${hash}`;
}

function fmtAmt(raw: bigint, symbol: string): string {
  return formatTokenRaw(raw, symbol, 18);
}

function decodeBought(log: Log): Omit<SwapHistoryRow, "at"> | null {
  try {
    const { args } = decodeEventLog({
      abi: SwapAbi,
      data: log.data,
      topics: log.topics,
    });
    const a = args as {
      buyer?: Address;
      paymentAmount?: bigint;
      tokenAmountDelivered?: bigint;
      buyerReward?: bigint;
    };
    if (!log.transactionHash || a.paymentAmount == null || a.buyerReward == null) return null;
    return {
      id: `${log.transactionHash}-${log.logIndex}-buy`,
      side: "BUY",
      paymentAmount: fmtAmt(a.paymentAmount, "USDT"),
      tokenAmount: fmtAmt(a.tokenAmountDelivered ?? 0n, "UMplan"),
      selfReward: fmtAmt(a.buyerReward, "UMplan"),
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
      seller?: Address;
      tokenAmount?: bigint;
      paymentDelivered?: bigint;
      sellerReward?: bigint;
    };
    if (!log.transactionHash || a.tokenAmount == null || a.sellerReward == null) return null;
    return {
      id: `${log.transactionHash}-${log.logIndex}-sell`,
      side: "SELL",
      paymentAmount: fmtAmt(a.paymentDelivered ?? 0n, "USDT"),
      tokenAmount: fmtAmt(a.tokenAmount, "UMplan"),
      selfReward: fmtAmt(a.sellerReward, "UMplan"),
      txHash: log.transactionHash,
      blockNumber: (log.blockNumber ?? 0n).toString(),
      explorerUrl: explorerTx(log.transactionHash),
    };
  } catch {
    return null;
  }
}

/** Read Bought/Sold for one wallet from the live SwapFacade (no Graph required). */
export async function fetchSwapHistory(address: string): Promise<SwapHistoryResponse | { error: string }> {
  const addr = address.toLowerCase();
  if (!isAddress(addr)) return { error: "address required" };
  if (!addresses.swap || addresses.swap === "0x0000000000000000000000000000000000000000") {
    return { error: "swap unconfigured" };
  }

  const client = createPublicClient({
    chain: bsc,
    transport: http(rpcUrl(), { timeout: 20_000 }),
  });

  const latest = await client.getBlockNumber();
  const fromBlock = SWAP_HOP_START_BLOCK > latest ? 0n : SWAP_HOP_START_BLOCK;

  const [buyLogs, sellLogs] = await Promise.all([
    getLogsChunked(client, {
      address: addresses.swap,
      event: boughtEvent,
      args: { buyer: addr as Address },
      fromBlock,
      toBlock: latest,
    }),
    getLogsChunked(client, {
      address: addresses.swap,
      event: soldEvent,
      args: { seller: addr as Address },
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

  for (const log of buyLogs) {
    const row = decodeBought(log);
    if (!row) continue;
    const ts = blockTs.get(row.blockNumber);
    rows.push({ ...row, at: ts != null ? tsToLocal(Number(ts)) : "—" });
    try {
      const pay = decodeEventLog({ abi: SwapAbi, data: log.data, topics: log.topics }).args as {
        paymentAmount?: bigint;
        buyerReward?: bigint;
      };
      buyVol += pay.paymentAmount ?? 0n;
      rewardSum += pay.buyerReward ?? 0n;
    } catch {
      /* ignore */
    }
  }
  for (const log of sellLogs) {
    const row = decodeSold(log);
    if (!row) continue;
    const ts = blockTs.get(row.blockNumber);
    rows.push({ ...row, at: ts != null ? tsToLocal(Number(ts)) : "—" });
    try {
      const pay = decodeEventLog({ abi: SwapAbi, data: log.data, topics: log.topics }).args as {
        sellerReward?: bigint;
      };
      rewardSum += pay.sellerReward ?? 0n;
    } catch {
      /* ignore */
    }
  }

  rows.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));

  return {
    source: "chain",
    address: addr,
    buyVolumeUsdt: formatUnits(buyVol, 18),
    selfRewardTotal: formatTokenRaw(rewardSum, "UMplan"),
    rows: rows.slice(0, 50),
  };
}

/** Map chain swap history into Mine 「Swap 推广奖励」 rows (self 0.5%). */
export function historyToSwapPromoRows(history: SwapHistoryResponse): EarningsRow[] {
  return history.rows.map((r) => ({
    id: r.id,
    label: r.side === "BUY" ? "买入自返" : "卖出自返",
    amount: r.selfReward,
    at: r.at,
  }));
}
