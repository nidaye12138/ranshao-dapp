import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SwapHistoryRow } from "@/lib/api/swapHistory";

export type CachedSwapRow = SwapHistoryRow & {
  /** Wei strings for totals (optional on older cache). */
  paymentWei?: string;
  rewardWei?: string;
};

export type AddrSwapCache = {
  scannedTo: number;
  buyVolumeWei: string;
  rewardWei: string;
  rows: CachedSwapRow[];
  updatedAt?: string;
};

const DEFAULT_DIR = "/var/tmp/umplan-swap-history";

export function swapHistoryCacheDir(): string {
  const fromEnv = (process.env.SWAP_HISTORY_CACHE_DIR || "").trim();
  return fromEnv || DEFAULT_DIR;
}

function pathFor(addr: string): string {
  const safe = addr.toLowerCase().replace(/[^a-f0-9x]/g, "");
  return join(swapHistoryCacheDir(), `${safe}.json`);
}

export function loadSwapHistoryCache(addr: string): AddrSwapCache {
  try {
    const raw = readFileSync(pathFor(addr), "utf8");
    const parsed = JSON.parse(raw) as AddrSwapCache;
    if (!parsed || !Array.isArray(parsed.rows)) {
      return { scannedTo: 0, buyVolumeWei: "0", rewardWei: "0", rows: [] };
    }
    return {
      scannedTo: Number(parsed.scannedTo) || 0,
      buyVolumeWei: parsed.buyVolumeWei || "0",
      rewardWei: parsed.rewardWei || "0",
      rows: parsed.rows.filter((r) => r && typeof r.id === "string"),
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return { scannedTo: 0, buyVolumeWei: "0", rewardWei: "0", rows: [] };
  }
}

export function saveSwapHistoryCache(addr: string, cache: AddrSwapCache): void {
  const path = pathFor(addr);
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    /* /var/tmp exists */
  }
  const body = JSON.stringify(
    { ...cache, updatedAt: new Date().toISOString() },
    null,
    0,
  );
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf8");
  renameSync(tmp, path);
}

/** Merge by row id; keep max scannedTo; recompute wei totals from rows when possible. */
export function mergeSwapHistoryCache(
  prev: AddrSwapCache,
  incoming: CachedSwapRow[],
  scannedTo: number,
  buyVolumeWei?: string,
  rewardWei?: string,
): AddrSwapCache {
  const map = new Map<string, CachedSwapRow>();
  for (const r of [...prev.rows, ...incoming]) {
    if (!r?.id) continue;
    map.set(r.id, r);
  }
  const rows = [...map.values()].sort(
    (a, b) => Number(b.blockNumber) - Number(a.blockNumber),
  );

  let buy = 0n;
  let reward = 0n;
  let haveWei = false;
  for (const r of rows) {
    if (r.paymentWei != null && r.side === "BUY") {
      try {
        buy += BigInt(r.paymentWei);
        haveWei = true;
      } catch {
        /* ignore */
      }
    }
    if (r.rewardWei != null && r.side === "BUY") {
      try {
        reward += BigInt(r.rewardWei);
        haveWei = true;
      } catch {
        /* ignore */
      }
    }
  }

  return {
    scannedTo: Math.max(prev.scannedTo || 0, scannedTo),
    buyVolumeWei: haveWei
      ? buy.toString()
      : buyVolumeWei != null
        ? buyVolumeWei
        : prev.buyVolumeWei || "0",
    rewardWei: haveWei
      ? reward.toString()
      : rewardWei != null
        ? rewardWei
        : prev.rewardWei || "0",
    rows,
  };
}
