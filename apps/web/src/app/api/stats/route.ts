import { NextResponse } from "next/server";
import { createPublicClient, http, formatUnits, parseUnits } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChain, appRpcUrl } from "@/lib/chain";
import { formatUsdRaw, graphQuery, graphUrl } from "@/lib/api/graph";
import type { StatsResponse } from "@/lib/api/types";
import { type Address, zeroAddress } from "viem";
import BurnAbi from "@/lib/abi/BurnRouter.json";
import {
  formatTokenUsd,
  PANCAKE_V2_ROUTER,
  PancakeRouterAbi,
} from "@/lib/tokenPrice";

export const dynamic = "force-dynamic";

const STATS_QUERY = `
  query ProtocolStats {
    protocolStats(id: "global") {
      totalBurnedToken
      totalBurnedUsd
    }
  }
`;

/** Admin-set MockPriceOracle — fallback only when DEX path is unavailable. */
const OracleAbi = [
  {
    type: "function",
    name: "tokenUsd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

async function readDexTokenUsd(
  client: ReturnType<typeof createPublicClient>,
): Promise<string | null> {
  const { token, spcxb, usdt } = addresses;
  if (token === zeroAddress || spcxb === zeroAddress || usdt === zeroAddress) return null;
  // Primary market: UMplan → SPCXB → USDT on Pancake V2 (matches Ave / DEX spot).
  try {
    const amounts = (await client.readContract({
      address: PANCAKE_V2_ROUTER,
      abi: PancakeRouterAbi,
      functionName: "getAmountsOut",
      args: [parseUnits("1", 18), [token, spcxb, usdt]],
    })) as bigint[];
    const out = amounts[amounts.length - 1];
    return formatTokenUsd(out);
  } catch {
    return null;
  }
}

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

  // Prefer live chain reads when modules are configured (burn totals + DEX/oracle USD).
  if (isConfigured && appRpcUrl) {
    try {
      const client = createPublicClient({
        chain: appChain,
        transport: http(appRpcUrl),
      });

      const oracleAddr = (process.env.NEXT_PUBLIC_ORACLE_ADDRESS || "").trim() as Address;
      const burnedTokP = client.readContract({
        address: addresses.burn,
        abi: BurnAbi,
        functionName: "totalBurnedToken",
      });
      const burnedUsdP = client.readContract({
        address: addresses.burn,
        abi: BurnAbi,
        functionName: "totalBurnedUsd",
      });
      const dexPriceP = readDexTokenUsd(client);
      const oracleP =
        oracleAddr.startsWith("0x") && oracleAddr.length === 42
          ? client.readContract({
              address: oracleAddr,
              abi: OracleAbi,
              functionName: "tokenUsd",
            })
          : Promise.resolve(null);

      const [burnedTok, burnedUsd, dexPrice, tokenUsd] = await Promise.all([
        burnedTokP,
        burnedUsdP,
        dexPriceP,
        oracleP,
      ]);

      totalBurnedToken = formatUsdRaw(burnedTok as bigint);
      totalBurnedUsd = formatUsdRaw(burnedUsd as bigint);

      if (dexPrice) {
        priceUsd = dexPrice;
      } else if (typeof tokenUsd === "bigint" && tokenUsd > 0n) {
        priceUsd = formatTokenUsd(tokenUsd) ?? Number(formatUnits(tokenUsd, 18)).toFixed(4);
      }
      source = source === "graph" ? "mixed" : "chain";
    } catch {
      // keep graph/unconfigured values
    }
  }

  const body: StatsResponse = { source, priceUsd, totalBurnedToken, totalBurnedUsd };
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
