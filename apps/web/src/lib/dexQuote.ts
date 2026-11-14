import { type Address, type PublicClient, parseUnits } from "viem";
import { PANCAKE_V2_ROUTER, PancakeRouterAbi } from "@/lib/tokenPrice";

/** Pancake V3 QuoterV2 (BSC). */
export const PANCAKE_V3_QUOTER_V2 =
  "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997" as const satisfies Address;

/** Common SPCXB/USDT V3 fee tier with deep liquidity. */
export const SPCXB_USDT_V3_FEE = 2500;

export const PancakeV3QuoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export async function quoteUsdtToUmplan(opts: {
  client: PublicClient;
  usdt: Address;
  spcxb: Address;
  umplan: Address;
  amountIn: bigint;
  fee?: number;
}): Promise<bigint> {
  const fee = opts.fee ?? SPCXB_USDT_V3_FEE;
  if (opts.amountIn <= 0n) return 0n;
  const hop = (await opts.client.readContract({
    address: PANCAKE_V3_QUOTER_V2,
    abi: PancakeV3QuoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: opts.usdt,
        tokenOut: opts.spcxb,
        amountIn: opts.amountIn,
        fee,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })) as [bigint, bigint, number, bigint];
  const hopOut = hop[0];
  if (hopOut <= 0n) return 0n;
  const amounts = (await opts.client.readContract({
    address: PANCAKE_V2_ROUTER,
    abi: PancakeRouterAbi,
    functionName: "getAmountsOut",
    args: [hopOut, [opts.spcxb, opts.umplan]],
  })) as bigint[];
  return amounts[amounts.length - 1] ?? 0n;
}

export async function quoteUmplanToUsdt(opts: {
  client: PublicClient;
  usdt: Address;
  spcxb: Address;
  umplan: Address;
  amountIn: bigint;
  fee?: number;
}): Promise<bigint> {
  const fee = opts.fee ?? SPCXB_USDT_V3_FEE;
  if (opts.amountIn <= 0n) return 0n;
  const amounts = (await opts.client.readContract({
    address: PANCAKE_V2_ROUTER,
    abi: PancakeRouterAbi,
    functionName: "getAmountsOut",
    args: [opts.amountIn, [opts.umplan, opts.spcxb]],
  })) as bigint[];
  const hopOut = amounts[amounts.length - 1] ?? 0n;
  if (hopOut <= 0n) return 0n;
  const pay = (await opts.client.readContract({
    address: PANCAKE_V3_QUOTER_V2,
    abi: PancakeV3QuoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: opts.spcxb,
        tokenOut: opts.usdt,
        amountIn: hopOut,
        fee,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })) as [bigint, bigint, number, bigint];
  return pay[0];
}

/** One whole unit (1e18) helper for smoke tests. */
export function oneUnit() {
  return parseUnits("1", 18);
}
