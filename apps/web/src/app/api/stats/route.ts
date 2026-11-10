import { NextResponse } from "next/server";
import { createPublicClient, http, formatUnits } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChain, appRpcUrl } from "@/lib/chain";
import { formatUsdRaw, graphQuery, graphUrl } from "@/lib/api/graph";
import type { StatsResponse } from "@/lib/api/types";
import BurnAbi from "@/lib/abi/BurnRouter.json";
import SwapAbi from "@/lib/abi/SwapFacade.json";

export const dynamic = "force-dynamic";

const STATS_QUERY = `
  query ProtocolStats {
    protocolStats(id: "global") {
      totalBurnedToken
      totalBurnedUsd
    }
  }
`;

export async function GET() {
  let source: StatsResponse["source"] = "unconfigured";
  let totalBurnedToken: string | null = null;
  let totalBurnedUsd: string | null = null;
  let priceUsd: string | null = null;

  if (graphUrl()) {
    const g = await graphQuery<{
      protocolStats: { totalBurnedToken: string; totalBurnedUsd: string } | null;
    }>(STATS_QUERY);
    if ("data" in g && g.data.protocolStats) {
      totalBurnedToken = formatUsdRaw(g.data.protocolStats.totalBurnedToken);
      totalBurnedUsd = formatUsdRaw(g.data.protocolStats.totalBurnedUsd);
      source = "graph";
    }
  }

  // Prefer live chain reads when modules are configured (burn totals + 1 USDT quote stub).
  if (isConfigured && appRpcUrl) {
    try {
      const client = createPublicClient({
        chain: appChain,
        transport: http(appRpcUrl),
      });

      const [burnedTok, burnedUsd, quote] = await Promise.all([
        client.readContract({
          address: addresses.burn,
          abi: BurnAbi,
          functionName: "totalBurnedToken",
        }) as Promise<bigint>,
        client.readContract({
          address: addresses.burn,
          abi: BurnAbi,
          functionName: "totalBurnedUsd",
        }) as Promise<bigint>,
        client.readContract({
          address: addresses.swap,
          abi: SwapAbi,
          functionName: "quoteUsdt",
          args: [10n ** 18n],
        }) as Promise<[bigint, bigint]>,
      ]);

      totalBurnedToken = formatUsdRaw(burnedTok);
      totalBurnedUsd = formatUsdRaw(burnedUsd);
      const tokensPerUsdt = quote?.[0];
      if (tokensPerUsdt && tokensPerUsdt > 0n) {
        priceUsd = (1 / Number(formatUnits(tokensPerUsdt, 18))).toFixed(4);
      }
      source = source === "graph" ? "mixed" : "chain";
    } catch {
      // keep graph/unconfigured values
    }
  }

  const body: StatsResponse = { source, priceUsd, totalBurnedToken, totalBurnedUsd };
  return NextResponse.json(body);
}
