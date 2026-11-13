import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { fetchSwapHistory } from "@/lib/api/swapHistory";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") || "").toLowerCase();
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  try {
    const result = await fetchSwapHistory(address);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "swap history failed" },
      { status: 502 },
    );
  }
}
