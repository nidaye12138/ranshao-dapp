import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Address } from "viem";
import type { BuyEdge } from "@/lib/api/leaderboardRank";

export type CachedBuy = {
  buyer: string;
  tokenAmount: string;
  block: number;
  tx?: string;
  swap?: string;
};

export type LeaderboardBuyCache = {
  scannedTo: number;
  buys: CachedBuy[];
  updatedAt?: string;
};

const DEFAULT_PATH = "/var/tmp/umplan-leaderboard-buys.json";

export function leaderboardBuyCachePath(): string {
  const fromEnv = (process.env.LEADERBOARD_BUY_CACHE || "").trim();
  return fromEnv || DEFAULT_PATH;
}

export function loadBuyCache(): LeaderboardBuyCache {
  try {
    const raw = readFileSync(leaderboardBuyCachePath(), "utf8");
    const parsed = JSON.parse(raw) as LeaderboardBuyCache;
    if (!parsed || !Array.isArray(parsed.buys)) return { scannedTo: 0, buys: [] };
    const scannedTo = Number(parsed.scannedTo) || 0;
    const buys = parsed.buys.filter(
      (b) => b && typeof b.buyer === "string" && typeof b.tokenAmount === "string",
    );
    return { scannedTo, buys, updatedAt: parsed.updatedAt };
  } catch {
    return { scannedTo: 0, buys: [] };
  }
}

export function saveBuyCache(cache: LeaderboardBuyCache): void {
  const path = leaderboardBuyCachePath();
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    /* /var/tmp exists */
  }
  const body = JSON.stringify(
    { ...cache, updatedAt: new Date().toISOString() },
    null,
    2,
  );
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf8");
  renameSync(tmp, path);
}

/** Merge new buys by tx hash (or buyer+block+amount); keep max scannedTo. */
export function mergeBuyCache(
  prev: LeaderboardBuyCache,
  incoming: CachedBuy[],
  scannedTo: number,
): LeaderboardBuyCache {
  const map = new Map<string, CachedBuy>();
  for (const b of [...prev.buys, ...incoming]) {
    const key =
      (b.tx && b.tx.toLowerCase()) ||
      `${b.buyer.toLowerCase()}:${b.block}:${b.tokenAmount}:${(b.swap || "").toLowerCase()}`;
    map.set(key, {
      buyer: b.buyer.toLowerCase(),
      tokenAmount: b.tokenAmount,
      block: Number(b.block) || 0,
      tx: b.tx,
      swap: b.swap,
    });
  }
  return {
    scannedTo: Math.max(prev.scannedTo || 0, scannedTo),
    buys: [...map.values()],
  };
}

export function cacheToBuyEdges(cache: LeaderboardBuyCache): BuyEdge[] {
  const out: BuyEdge[] = [];
  for (const b of cache.buys) {
    try {
      const tokenAmount = BigInt(b.tokenAmount);
      if (tokenAmount <= 0n) continue;
      out.push({ buyer: b.buyer as Address, tokenAmount });
    } catch {
      /* skip bad rows */
    }
  }
  return out;
}
