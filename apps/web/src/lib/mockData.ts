/**
 * Static CMS defaults + layer label helper.
 * Live tabs fetch `/api/*` (graph or unconfigured); do not invent fake leaderboard rows.
 */

export { layerLabel, type LayerLabel } from "@/lib/api/types";

/** Fallback copy when `/api/announcements` has not loaded yet (SSR-safe). */
export const announcements = [
  { id: "1", text: "加载公告…" },
];

export const banners = [
  {
    id: "b1",
    title: "四档分红 · 每日可领",
    subtitle: "持有对应权重档位后进入 SPCXB 分红池，24 小时可领一次",
    tone: "teal" as const,
  },
];

export const tokenIntro =
  "Umidor（dApp 品牌）基于 BNB Chain。代币展示名 UMplan；分红池资产为 SPCXB。买卖手续费产品承诺 3.5%（最低 3%）。";

export const dappRules = [
  "Swap：买/卖均即时 0.5% 自返 + 0.5% 直推；无累计买入业绩级别。手续费产品承诺 3.5%（最低 3%）。",
  "权重销毁档位：100 / 500 / 800 / 1500 U；仅档位按钮计入权益；层奖：直推 20% / 间推 10% / 市场 10%（占权重额；明细市场3…市场9）。",
  "分红：每地址每 24h 可领一次（链上冷却）。1500U 按钮解锁质押台（最短 24h）。",
  "推广资格：在「权重」点选任意档位按钮燃烧（≥100U）后解锁邀请链接——非累计买入。",
];
