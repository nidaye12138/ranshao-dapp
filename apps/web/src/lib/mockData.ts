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
  { id: "b1", title: "Umidor", subtitle: "买入 · 燃烧 · 四档分红", tone: "teal" as const },
];

export const tokenIntro =
  "Umidor 基于 BNB Chain。项目币为外部 UMplan；分红池资产为 SPCXB。";

export const dappRules = [
  "Swap：买/卖均即时 0.5% 自返 + 0.5% 直推；无累计买入业绩级别。",
  "燃烧档位：100 / 500 / 800 / 1500 U；九层明细：直推 / 间推 / 市场3…市场9。",
  "分红：每地址每 24h 可领一次（链上冷却）。",
  "推广资格：燃烧任意档（≥100U）后解锁邀请链接。",
];
