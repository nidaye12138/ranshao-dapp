import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { formatTokenRaw, graphQuery, graphUrl, tsToLocal } from "@/lib/api/graph";
import { layerLabel, type EarningsResponse, type EarningsRow } from "@/lib/api/types";

export const dynamic = "force-dynamic";

const QUERY = `
  query Earnings($id: ID!, $first: Int!) {
    account(id: $id) {
      id
      swapRewards(first: $first, orderBy: timestamp, orderDirection: desc, where: { role: "referrer" }) {
        id
        rewardAmount
        timestamp
        side
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

export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") || "").toLowerCase();
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  if (!graphUrl()) {
    return NextResponse.json(empty(address));
  }

  const result = await graphQuery<{
    account: {
      id: string;
      swapRewards: { id: string; rewardAmount: string; timestamp: string; side: string }[];
      layerRewards: { id: string; layer: number; amount: string; timestamp: string }[];
      dividendClaims: { id: string; amount: string; timestamp: string }[];
    } | null;
  }>(QUERY, { id: address, first: 50 });

  if ("error" in result) {
    return NextResponse.json({ ...empty(address), error: result.error }, { status: 502 });
  }

  const a = result.data.account;
  if (!a) {
    return NextResponse.json({ ...empty(address), source: "graph" as const });
  }

  const swapPromoRows: EarningsRow[] = a.swapRewards.map((r) => ({
    id: r.id,
    label: "直推",
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

  const body: EarningsResponse = {
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
  return NextResponse.json(body);
}
