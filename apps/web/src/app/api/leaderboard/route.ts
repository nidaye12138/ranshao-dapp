import { NextResponse } from "next/server";
import { graphQuery, graphUrl } from "@/lib/api/graph";
import { fetchLeaderboardFromChain } from "@/lib/api/leaderboardChain";
import type { LeaderboardResponse } from "@/lib/api/types";

export const dynamic = "force-dynamic";

const QUERY = `
  query Leaderboard($first: Int!) {
    accounts(first: $first, orderBy: directCount, orderDirection: desc, where: { directCount_gt: 0 }) {
      id
      directCount
    }
  }
`;

export async function GET() {
  const updatedAt = new Date().toISOString();

  if (graphUrl()) {
    const result = await graphQuery<{ accounts: { id: string; directCount: string }[] }>(QUERY, {
      first: 10,
    });

    if (!("error" in result)) {
      const items = result.data.accounts.map((a, i) => ({
        rank: i + 1,
        address: a.id,
        directs: Number(a.directCount),
      }));
      const body: LeaderboardResponse = { source: "graph", updatedAt, items };
      return NextResponse.json(body);
    }
    // fall through to chain if graph errors
  }

  const chain = await fetchLeaderboardFromChain(10);
  if (chain.error && chain.items.length === 0) {
    const body: LeaderboardResponse & { error?: string } = {
      source: "unconfigured",
      updatedAt,
      items: [],
      error: chain.error,
    };
    return NextResponse.json(body, { status: graphUrl() ? 502 : 200 });
  }

  const body: LeaderboardResponse = {
    source: "chain",
    updatedAt,
    items: chain.items,
  };
  return NextResponse.json(body);
}
