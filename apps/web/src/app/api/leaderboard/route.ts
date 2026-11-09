import { NextResponse } from "next/server";
import { graphQuery, graphUrl } from "@/lib/api/graph";
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

  if (!graphUrl()) {
    const body: LeaderboardResponse = {
      source: "unconfigured",
      updatedAt,
      items: [],
    };
    return NextResponse.json(body);
  }

  const result = await graphQuery<{ accounts: { id: string; directCount: string }[] }>(QUERY, {
    first: 10,
  });

  if ("error" in result) {
    return NextResponse.json(
      { source: "unconfigured", updatedAt, items: [], error: result.error } satisfies LeaderboardResponse & {
        error?: string;
      },
      { status: 502 }
    );
  }

  const items = result.data.accounts.map((a, i) => ({
    rank: i + 1,
    address: a.id,
    directs: Number(a.directCount),
  }));

  const body: LeaderboardResponse = { source: "graph", updatedAt, items };
  return NextResponse.json(body);
}
