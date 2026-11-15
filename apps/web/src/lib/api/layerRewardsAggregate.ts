export type LayerPaidEdge = {
  id: string;
  burner: string;
  recipient: string;
  layer: number;
  amount: bigint;
  blockNumber: bigint;
  at: string;
};

export type LayerEarningsRow = {
  id: string;
  label: string;
  amount: string;
  at: string;
  layer?: number;
};

function layerLabel(layer: number): string {
  if (layer === 1) return "直推";
  if (layer === 2) return "间推";
  if (layer >= 3 && layer <= 9) return `市场${layer}`;
  return "—";
}

function formatUMplan(raw: bigint): string {
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const whole = v / 10n ** 18n;
  const frac = v % 10n ** 18n;
  let s = whole.toString();
  if (frac > 0n) {
    const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "").slice(0, 4);
    if (fracStr) s = `${s}.${fracStr}`;
  }
  return `${neg ? `-${s}` : s} UMplan`;
}

/** Pure aggregator for Mine 「层奖」 totals + rows (newest first). */
export function aggregateLayerPaid(rows: LayerPaidEdge[]): {
  layerTotal: { 直推: string; 间推: string; 市场: string };
  layerRows: LayerEarningsRow[];
} {
  let l1 = 0n;
  let l2 = 0n;
  let lM = 0n;
  const sorted = [...rows].sort((a, b) => {
    if (b.blockNumber === a.blockNumber) return b.id.localeCompare(a.id);
    return b.blockNumber > a.blockNumber ? 1 : -1;
  });

  const layerRows: LayerEarningsRow[] = sorted.map((r) => {
    if (r.layer === 1) l1 += r.amount;
    else if (r.layer === 2) l2 += r.amount;
    else if (r.layer >= 3 && r.layer <= 9) lM += r.amount;
    return {
      id: r.id,
      layer: r.layer,
      label: layerLabel(r.layer),
      amount: formatUMplan(r.amount),
      at: r.at,
    };
  });

  return {
    layerTotal: {
      直推: formatUMplan(l1),
      间推: formatUMplan(l2),
      市场: formatUMplan(lM),
    },
    layerRows,
  };
}
