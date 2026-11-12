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

/** Home 「DApp 玩法规则」— aligned to locked prefs (30/50/15/5 + UMplan stake). */
export const dappRules = [
  "手续费：买入 / 卖出交易收取手续费，协议约定最低 3%，系统参数当前默认 3.5%。",
  "权重分配：权重订单资金按合约固定比例自动执行：30% 打入销毁地址、50% 市场奖励桶、15% 股东、5% 变异沉淀池。",
  "质押分红：达成第四档 1500U 解锁质押权益，质押 UMplan 获得分红配额，分红以 UMplan 币量发放。公式：百 5 总释放量 ÷ 全网总质押 = 每币分红。",
  "币种口径：推广类代币奖励、质押分红均以 UMplan 发放；完成权重销毁后，按所达档位享受对应档次的 SPCXB 分红。",
  "推广奖励：达到 100U 门槛解锁推广资格后，享受直推、间推与市场奖励（直推、间推以外的团队成员统称市场），买入另享 0.5% 即时到账。",
];
