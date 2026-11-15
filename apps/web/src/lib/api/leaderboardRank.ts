import type { LeaderboardRow } from "./types.ts";

export type BindEdge = { user: string; referrer: string };
export type BuyEdge = { buyer: string; tokenAmount: bigint };

const ZERO = "0x0000000000000000000000000000000000000000";
/** Match subgraph: walk up to 9 layers when attributing buy volume. */
export const UMBRELLA_LAYERS = 9;

export function buildReferrerMap(binds: BindEdge[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const b of binds) {
    const user = b.user.toLowerCase();
    const ref = b.referrer.toLowerCase();
    if (!user || !ref || ref === ZERO) continue;
    map.set(user, ref);
  }
  return map;
}

/** Downline buy UMplan attributed to each ancestor (excludes buyer's own account). */
export function umbrellaTokenByAncestor(
  binds: BindEdge[],
  buys: BuyEdge[],
  layers = UMBRELLA_LAYERS,
): Map<string, bigint> {
  const parent = buildReferrerMap(binds);
  const umbrella = new Map<string, bigint>();
  for (const buy of buys) {
    if (buy.tokenAmount <= 0n) continue;
    let cur = parent.get(buy.buyer.toLowerCase());
    for (let i = 0; i < layers && cur; i++) {
      umbrella.set(cur, (umbrella.get(cur) || 0n) + buy.tokenAmount);
      cur = parent.get(cur);
    }
  }
  return umbrella;
}

function formatToken(raw: bigint): string {
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const whole = v / 10n ** 18n;
  const frac = v % 10n ** 18n;
  let s = whole.toString();
  if (frac > 0n) {
    const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "").slice(0, 4);
    if (fracStr) s = `${s}.${fracStr}`;
  }
  return neg ? `-${s}` : s;
}

/** Pure aggregator — directs rank, umbrella UMplan volume attached. */
export function rankDirectsFromBinds(
  binds: BindEdge[],
  first: number,
  buys: BuyEdge[] = [],
): LeaderboardRow[] {
  const counts = new Map<string, number>();
  for (const b of binds) {
    const ref = b.referrer.toLowerCase();
    if (!ref || ref === ZERO) continue;
    counts.set(ref, (counts.get(ref) || 0) + 1);
  }
  const umbrella = umbrellaTokenByAncestor(binds, buys);
  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const ua = umbrella.get(a[0]) || 0n;
      const ub = umbrella.get(b[0]) || 0n;
      if (ub !== ua) return ub > ua ? 1 : -1;
      return a[0].localeCompare(b[0]);
    })
    .slice(0, Math.max(0, first))
    .map(([address, directs], i) => {
      const raw = umbrella.get(address) || 0n;
      return {
        rank: i + 1,
        address,
        directs,
        umbrellaToken: formatToken(raw),
      };
    });
}
