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
  spotUsdFromPoolMid,
} from "@/lib/tokenPrice";
import {
  PANCAKE_V3_QUOTER_V2,
  PancakeV3QuoterAbi,
  SPCXB_USDT_V3_FEE,
  quoteUmplanToUsdt,
} from "@/lib/dexQuote";

export const dynamic = "force-dynamic";

/** Mainnet UMplan/SPCXB Pancake V2 pair (Ave / DexScreener pool). */
const UMPLAN_SPCXB_PAIR =
  "0xC3118CCC0be00E7FA39aC8041694e09F52178d6F" as const satisfies Address;

const PairAbi = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

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

async function readV3UsdtPerSpcxb(
  client: ReturnType<typeof createPublicClient>,
  spcxb: Address,
  usdt: Address,
): Promise<bigint | null> {
  try {
    const quoted = (await client.readContract({
      address: PANCAKE_V3_QUOTER_V2,
      abi: PancakeV3QuoterAbi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: spcxb,
          tokenOut: usdt,
          amountIn: parseUnits("1", 18),
          fee: SPCXB_USDT_V3_FEE,
          sqrtPriceLimitX96: 0n,
        },
      ],
    })) as [bigint, bigint, number, bigint];
    return quoted[0] > 0n ? quoted[0] : null;
  } catch {
    return null;
  }
}

/**
 * Homepage spot: UMplan/SPCXB V2 mid × SPCXB→USDT V3 (deep pool).
 * Pure V2 UMplan→SPCXB→USDT is wrong — V2 SPCXB/USDT is thin (~$0.04 vs ~$140 on V3).
 */
async function readDexTokenUsd(
  client: ReturnType<typeof createPublicClient>,
): Promise<string | null> {
  const { token, spcxb, usdt } = addresses;
  if (token === zeroAddress || spcxb === zeroAddress || usdt === zeroAddress) return null;

  try {
    const [token0, reserves, usdtPerSpcxb] = await Promise.all([
      client.readContract({
        address: UMPLAN_SPCXB_PAIR,
        abi: PairAbi,
        functionName: "token0",
      }) as Promise<Address>,
      client.readContract({
        address: UMPLAN_SPCXB_PAIR,
        abi: PairAbi,
        functionName: "getReserves",
      }) as Promise<readonly [bigint, bigint, number]>,
      readV3UsdtPerSpcxb(client, spcxb, usdt),
    ]);

    if (usdtPerSpcxb) {
      const tokenIs0 = token0.toLowerCase() === token.toLowerCase();
      const reserveToken = tokenIs0 ? reserves[0] : reserves[1];
      const reserveSpcxb = tokenIs0 ? reserves[1] : reserves[0];
      const mid = spotUsdFromPoolMid({
        reserveToken,
        reserveSpcxb,
        usdtPerSpcxb18: usdtPerSpcxb,
      });
      const formatted = mid ? formatTokenUsd(mid) : null;
      if (formatted) return formatted;
    }
  } catch {
    // fall through
  }

  // Execution-aligned fallback (same hop as SwapFacade sell path).
  try {
    const out = await quoteUmplanToUsdt({
      client: client as never,
      usdt,
      spcxb,
      umplan: token,
      amountIn: parseUnits("1", 18),
    });
    const formatted = formatTokenUsd(out);
    if (formatted) return formatted;
  } catch {
    // fall through
  }

  // Last resort: full V2 path (may underprice if SPCXB/USDT V2 is thin).
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
