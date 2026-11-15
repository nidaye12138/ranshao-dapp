/** Spot USD for burnTier buttons (must match Constants / promo TIERS). */
export const BUTTON_TIER_USD: Record<number, number> = {
  1: 1,
  2: 5,
  3: 8,
  4: 15,
};

/**
 * Reconstruct which burnTier buttons were actually paid.
 *
 * BurnRouter only stores highest `buttonTierOf` — jumping T1→T4 is allowed on-chain
 * (strict upgrade), so `id <= effectiveTier` must NOT mean "purchased".
 * With exact gold-peg burns, `burnedUsd` ≈ sum of purchased tier USD values.
 */
export function inferPurchasedButtonTiers(
  buttonTier: number,
  burnedUsd: number,
): Set<number> {
  if (!Number.isFinite(buttonTier) || buttonTier < 1 || buttonTier > 4) {
    return new Set();
  }
  if (!Number.isFinite(burnedUsd) || burnedUsd <= 0) {
    return new Set([buttonTier]);
  }

  const lowers: number[] = [];
  for (let id = 1; id < buttonTier; id++) lowers.push(id);

  let best: number[] = [buttonTier];
  let bestDiff = Number.POSITIVE_INFINITY;
  const n = lowers.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const set = [buttonTier];
    let sum = BUTTON_TIER_USD[buttonTier] ?? 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        const id = lowers[i]!;
        set.push(id);
        sum += BUTTON_TIER_USD[id] ?? 0;
      }
    }
    const diff = Math.abs(sum - burnedUsd);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = set;
    }
  }

  const tol = Math.max(0.25, burnedUsd * 0.05);
  if (bestDiff > tol) {
    return new Set([buttonTier]);
  }
  return new Set(best);
}
