import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { formatTokenRaw, graphQuery, graphUrl, tsToLocal } from "@/lib/api/graph";
import { fetchSwapHistory, historyToSwapPromoRows } from "@/lib/api/swapHistory";
import { layerLabel, type EarningsResponse, type EarningsRow } from "@/lib/api/types";

export const dynamic = "force-dynamic";

const QUERY = `
  query Earnings($id: ID!, $first: Int!) {
    account(id: $id) {
      id
      swapRewards(first: $first, orderBy: timestamp, orderDirection: desc) {
        id
        rewardAmount
        timestamp
        side
        role
      }
      layerRewards(first: $first, orderBy: timestamp, orderDirection: desc) {
        id
        layer
        amount
        timestamp
      }
      dividendClaims(first: $first, orderBy: timestamp, orderDirection: desc) {
        id
        amount
        timestamp
      }
    }
  }
`;

function empty(address: string): EarningsResponse {
  return {
    source: "unconfigured",
    address,
    swapPromoTotal: "0 USDT",
    swapPromoRows: [],
    layerTotal: { 直推: "0 UMplan", 间推: "0 UMplan", 市场: "0 UMplan" },
    layerRows: [],
    dividendTotal: "0 SPCXB",
    dividendRows: [],
  };
}

function sum(amounts: string[]): bigint {
  return amounts.reduce((acc, x) => acc + BigInt(x || "0"), 0n);
}

async function chainSwapFallback(address: string, base: EarningsResponse): Promise<EarningsResponse> {
  try {
    const history = await fetchSwapHistory(address);
    if ("error" in history) return base;
    const rows = historyToSwapPromoRows(history);
    return {
      ...base,
      source: "chain",
      swapPromoTotal: history.selfRewardTotal,
      swapPromoRows: rows,
    };
  } catch {
    return base;
  }
}

export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") || "").toLowerCase();
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  if (!graphUrl()) {
    return NextResponse.json(await chainSwapFallback(address, empty(address)));
  }

  const result = await graphQuery<{
    account: {
      id: string;
      swapRewards: { id: string; rewardAmount: string; timestamp: string; side: string; role: string }[];
      layerRewards: { id: string; layer: number; amount: string; timestamp: string }[];
      dividendClaims: { id: string; amount: string; timestamp: string }[];
    } | null;
  }>(QUERY, { id: address, first: 50 });

  if ("error" in result) {
    const fallback = await chainSwapFallback(address, { ...empty(address), source: "unconfigured" });
    if (fallback.source === "chain") return NextResponse.json(fallback);
    return NextResponse.json({ ...empty(address), error: result.error }, { status: 502 });
  }

  const a = result.data.account;
  if (!a) {
    return NextResponse.json(await chainSwapFallback(address, { ...empty(address), source: "graph" }));
  }

  const swapPromoRows: EarningsRow[] = a.swapRewards.map((r) => ({
    id: r.id,
    label: r.role === "self" ? (r.side === "SELL" ? "卖出自返" : "买入自返") : "直推",
    amount: formatTokenRaw(r.rewardAmount, "USDT"),
    at: tsToLocal(r.timestamp),
  }));

  const layerRows: EarningsRow[] = a.layerRewards.map((r) => ({
    id: r.id,
    layer: r.layer,
    label: layerLabel(r.layer),
    amount: formatTokenRaw(r.amount, "UMplan"),
    at: tsToLocal(r.timestamp),
  }));

  const l1 = a.layerRewards.filter((r) => r.layer === 1).map((r) => r.amount);
  const l2 = a.layerRewards.filter((r) => r.layer === 2).map((r) => r.amount);
  const lM = a.layerRewards.filter((r) => r.layer >= 3 && r.layer <= 9).map((r) => r.amount);

  const dividendRows: EarningsRow[] = a.dividendClaims.map((r) => ({
    id: r.id,
    label: "分红领取",
    amount: formatTokenRaw(r.amount, "SPCXB"),
    at: tsToLocal(r.timestamp),
  }));

  let body: EarningsResponse = {
    source: "graph",
    address: a.id,
    swapPromoTotal: formatTokenRaw(sum(a.swapRewards.map((r) => r.rewardAmount)), "USDT"),
    swapPromoRows,
    layerTotal: {
      直推: formatTokenRaw(sum(l1), "UMplan"),
      间推: formatTokenRaw(sum(l2), "UMplan"),
      市场: formatTokenRaw(sum(lM), "UMplan"),
    },
    layerRows,
    dividendTotal: formatTokenRaw(sum(a.dividendClaims.map((r) => r.amount)), "SPCXB"),
    dividendRows,
  };

  if (!swapPromoRows.length) {
    body = await chainSwapFallback(address, body);
  }

  return NextResponse.json(body);
}
