import type { LeaderboardRow } from "./types.ts";

export type BindEdge = { user: string; referrer: string };

/** Pure aggregator — testable without RPC. */
export function rankDirectsFromBinds(binds: BindEdge[], first: number): LeaderboardRow[] {
  const counts = new Map<string, number>();
  for (const b of binds) {
    const ref = b.referrer.toLowerCase();
    if (!ref || ref === "0x0000000000000000000000000000000000000000") continue;
    counts.set(ref, (counts.get(ref) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, first))
    .map(([address, directs], i) => ({
      rank: i + 1,
      address,
      directs,
    }));
}
