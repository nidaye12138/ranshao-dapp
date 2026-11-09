/** Off-chain stubs until indexer/API is live (UI IA §5.2). */

export const announcements = [
  { id: "1", text: "Umidor UM 计划已上线：买入/卖出即时 0.5%+0.5%，燃烧四档入池。" },
  { id: "2", text: "分红领取冷却：每地址每 24 小时可领一次 SPCXB，也可累计不领。" },
  { id: "3", text: "推广资格：燃烧任意档（最低 100U）后解锁邀请链接。" },
];

export const banners = [
  { id: "b1", title: "Umidor", subtitle: "买入 · 燃烧 · 四档分红", tone: "teal" as const },
];

/** Mock top-10 by direct-ref count */
export const topDirectRefs = [
  { rank: 1, address: "0xA11CE00000000000000000000000000000000001", directs: 128 },
  { rank: 2, address: "0xB0B0000000000000000000000000000000000002", directs: 96 },
  { rank: 3, address: "0xC0FFEE0000000000000000000000000000000003", directs: 74 },
  { rank: 4, address: "0xD00D000000000000000000000000000000000004", directs: 61 },
  { rank: 5, address: "0xE1E1000000000000000000000000000000000005", directs: 55 },
  { rank: 6, address: "0xF00D000000000000000000000000000000000006", directs: 42 },
  { rank: 7, address: "0xABCDEF0000000000000000000000000000000007", directs: 38 },
  { rank: 8, address: "0x1234560000000000000000000000000000000008", directs: 29 },
  { rank: 9, address: "0x9876540000000000000000000000000000000009", directs: 21 },
  { rank: 10, address: "0x555555000000000000000000000000000000000a", directs: 17 },
];

export type LayerLabel = "直推" | "间推" | `市场${3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export function layerLabel(layer: number): LayerLabel | "—" {
  if (layer === 1) return "直推";
  if (layer === 2) return "间推";
  if (layer >= 3 && layer <= 9) return `市场${layer as 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
  return "—";
}

/** Mock earnings ledger rows (layer rewards + swap promo + dividend). */
export const mockEarnings = {
  swapPromoTotal: "12.50 USDT",
  swapPromoRows: [
    { id: "s1", label: "直推", amount: "5.00 USDT", at: "2026-11-08 14:22" },
    { id: "s2", label: "直推", amount: "7.50 USDT", at: "2026-11-07 09:10" },
  ],
  layerTotal: {
    直推: "400 UMplan",
    间推: "200 UMplan",
    市场: "1,200 UMplan",
  },
  layerRows: [
    { id: "l1", layer: 1, label: "直推" as const, amount: "400 UMplan", at: "2026-11-08 18:01" },
    { id: "l2", layer: 2, label: "间推" as const, amount: "200 UMplan", at: "2026-11-08 18:01" },
    { id: "l3", layer: 3, label: "市场3" as const, amount: "200 UMplan", at: "2026-11-08 18:01" },
    { id: "l8", layer: 8, label: "市场8" as const, amount: "200 UMplan", at: "2026-11-07 11:40" },
  ],
  dividendTotal: "0 SPCXB",
  dividendRows: [] as { id: string; label: string; amount: string; at: string }[],
  team: {
    directs: 3,
    indirects: 8,
    buyVolumeUsd: "12,400",
    umbrellaUsd: "48,200",
  },
};

export const tokenIntro =
  "Umidor 基于 BNB Chain。项目币为外部 UMplan；分红池资产为 SPCXB。买入/卖出即时奖各 0.5%（支付币种）到买方与直推；燃烧按金本位四档入池，拆账 70% 销毁 / 20% 九层 / 10% 股东。";

export const dappRules = [
  "Swap：买/卖均即时 0.5% 自返 + 0.5% 直推；无累计买入业绩级别。",
  "燃烧档位：100 / 500 / 800 / 1500 U（最高档资格）；九层：直推=L1，间推=L2，市场=L3–9（明细市场3…市场9）。",
  "分红：SPCXB 四档同档均分；每地址每 24h 可领一次（链上冷却）。",
  "推广资格：燃烧任意档且金本位 ≥100U 后解锁邀请链接。",
];
