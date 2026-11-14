import { formatTokenRaw } from "./graph.ts";
import { layerLabel, type EarningsRow } from "./types.ts";

export type LayerPaidEdge = {
  id: string;
  burner: string;
  recipient: string;
  layer: number;
  amount: bigint;
  blockNumber: bigint;
  at: string;
};

/** Pure aggregator for Mine 「层奖」 totals + rows (newest first). */
export function aggregateLayerPaid(rows: LayerPaidEdge[]): {
  layerTotal: { 直推: string; 间推: string; 市场: string };
  layerRows: EarningsRow[];
} {
  let l1 = 0n;
  let l2 = 0n;
  let lM = 0n;
  const sorted = [...rows].sort((a, b) => {
    if (b.blockNumber === a.blockNumber) return b.id.localeCompare(a.id);
    return b.blockNumber > a.blockNumber ? 1 : -1;
  });

  const layerRows: EarningsRow[] = sorted.map((r) => {
    if (r.layer === 1) l1 += r.amount;
    else if (r.layer === 2) l2 += r.amount;
    else if (r.layer >= 3 && r.layer <= 9) lM += r.amount;
    return {
      id: r.id,
      layer: r.layer,
      label: layerLabel(r.layer),
      amount: formatTokenRaw(r.amount, "UMplan"),
      at: r.at,
    };
  });

  return {
    layerTotal: {
      直推: formatTokenRaw(l1, "UMplan"),
      间推: formatTokenRaw(l2, "UMplan"),
      市场: formatTokenRaw(lM, "UMplan"),
    },
    layerRows,
  };
}
