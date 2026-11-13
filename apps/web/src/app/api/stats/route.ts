import { NextResponse } from "next/server";
import { createPublicClient, http, formatUnits } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChain, appRpcUrl } from "@/lib/chain";
import { formatUsdRaw, graphQuery, graphUrl } from "@/lib/api/graph";
import type { StatsResponse } from "@/lib/api/types";
import { type Address } from "viem";
import BurnAbi from "@/lib/abi/BurnRouter.json";

export const dynamic = "force-dynamic";

const STATS_QUERY = `
  query ProtocolStats {
    protocolStats(id: "global") {
      totalBurnedToken
      totalBurnedUsd
    }
  }
`;

/** Minimal oracle surface — DEX Swap quotes are in SPCXB, not USDT, so do not invert quoteUsdt. */
const OracleAbi = [
  {
    type: "function",
    name: "tokenUsd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

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

  // Prefer live chain reads when modules are configured (burn totals + oracle token USD).
  if (isConfigured && appRpcUrl) {
    try {
      const client = createPublicClient({
        chain: appChain,
        transport: http(appRpcUrl),
      });

      const oracleAddr = (process.env.NEXT_PUBLIC_ORACLE_ADDRESS || "").trim() as Address;
      const reads: Promise<unknown>[] = [
        client.readContract({
          address: addresses.burn,
          abi: BurnAbi,
          functionName: "totalBurnedToken",
        }),
        client.readContract({
          address: addresses.burn,
          abi: BurnAbi,
          functionName: "totalBurnedUsd",
        }),
      ];
      if (oracleAddr.startsWith("0x") && oracleAddr.length === 42) {
        reads.push(
          client.readContract({
            address: oracleAddr,
            abi: OracleAbi,
            functionName: "tokenUsd",
          }),
        );
      }

      const settled = await Promise.all(reads);
      const burnedTok = settled[0] as bigint;
      const burnedUsd = settled[1] as bigint;
      totalBurnedToken = formatUsdRaw(burnedTok);
      totalBurnedUsd = formatUsdRaw(burnedUsd);
      if (settled.length > 2) {
        const tokenUsd = settled[2] as bigint;
        if (tokenUsd > 0n) {
          priceUsd = Number(formatUnits(tokenUsd, 18)).toFixed(4);
        }
      }
      source = source === "graph" ? "mixed" : "chain";
    } catch {
      // keep graph/unconfigured values
    }
  }

  const body: StatsResponse = { source, priceUsd, totalBurnedToken, totalBurnedUsd };
  return NextResponse.json(body);
}
