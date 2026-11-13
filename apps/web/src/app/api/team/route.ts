import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { formatUsdRaw, graphQuery, graphUrl } from "@/lib/api/graph";
import { fetchSwapHistory } from "@/lib/api/swapHistory";
import type { TeamResponse } from "@/lib/api/types";

export const dynamic = "force-dynamic";

const QUERY = `
  query Team($id: ID!) {
    account(id: $id) {
      id
      directCount
      indirectCount
      buyVolumeUsd
      umbrellaVolumeUsd
    }
  }
`;

function empty(address: string): TeamResponse {
  return {
    source: "unconfigured",
    address,
    directs: 0,
    indirects: 0,
    buyVolumeUsd: "0",
    umbrellaUsd: "0",
  };
}

async function withChainBuyVolume(address: string, base: TeamResponse): Promise<TeamResponse> {
  try {
    const history = await fetchSwapHistory(address);
    if ("error" in history) return base;
    const vol = Number(history.buyVolumeUsdt);
    if (!Number.isFinite(vol) || vol <= 0) return { ...base, source: base.source === "unconfigured" ? "chain" : base.source };
    return {
      ...base,
      source: base.source === "graph" ? "mixed" : "chain",
      buyVolumeUsd: vol.toFixed(4).replace(/\.?0+$/, ""),
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
    return NextResponse.json(await withChainBuyVolume(address, empty(address)));
  }

  const result = await graphQuery<{
    account: {
      id: string;
      directCount: string;
      indirectCount: string;
      buyVolumeUsd: string;
      umbrellaVolumeUsd: string;
    } | null;
  }>(QUERY, { id: address });

  if ("error" in result) {
    return NextResponse.json({ ...empty(address), error: result.error }, { status: 502 });
  }

  const a = result.data.account;
  if (!a) {
    return NextResponse.json({ ...empty(address), source: "graph" as const });
  }

  const body: TeamResponse = {
    source: "graph",
    address: a.id,
    directs: Number(a.directCount),
    indirects: Number(a.indirectCount),
    buyVolumeUsd: formatUsdRaw(a.buyVolumeUsd),
    umbrellaUsd: formatUsdRaw(a.umbrellaVolumeUsd),
  };
  return NextResponse.json(body);
}
