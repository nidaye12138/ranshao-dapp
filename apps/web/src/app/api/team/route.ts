import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { formatUsdRaw, graphQuery, graphUrl } from "@/lib/api/graph";
import { fetchTeamDirectsFromChain } from "@/lib/api/teamChain";
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
    members: [],
  };
}

export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") || "").toLowerCase();
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  // Fast path: ReferralTree.getDirectRefs (eth_call). No eth_getLogs — avoids CF/nginx 504.
  const chainTeam = await fetchTeamDirectsFromChain(address as Address);
  let base = empty(address);
  if (!chainTeam.error || chainTeam.members.length > 0 || chainTeam.directs > 0) {
    base = {
      ...base,
      source: "chain",
      directs: chainTeam.directs,
      members: chainTeam.members,
    };
  } else if (chainTeam.error && /registry unconfigured/i.test(chainTeam.error)) {
    base = { ...base, source: "unconfigured" };
  } else if (chainTeam.error) {
    return NextResponse.json({ ...base, source: "chain", error: chainTeam.error }, { status: 200 });
  }

  if (graphUrl()) {
    const result = await graphQuery<{
      account: {
        id: string;
        directCount: string;
        indirectCount: string;
        buyVolumeUsd: string;
        umbrellaVolumeUsd: string;
      } | null;
    }>(QUERY, { id: address });

    if (!("error" in result) && result.data.account) {
      const a = result.data.account;
      const body: TeamResponse = {
        source: "graph",
        address: a.id,
        directs: Number(a.directCount) || base.directs,
        indirects: Number(a.indirectCount),
        buyVolumeUsd: formatUsdRaw(a.buyVolumeUsd),
        umbrellaUsd: formatUsdRaw(a.umbrellaVolumeUsd),
        members: base.members?.length ? base.members : chainTeam.members,
      };
      if (body.members?.length) {
        body.directs = Math.max(body.directs, body.members.length);
      }
      return NextResponse.json(body);
    }
  }

  return NextResponse.json(base);
}
