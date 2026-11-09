export type ApiSource = "graph" | "unconfigured" | "static" | "chain" | "mixed";

export type LayerLabel = "直推" | "间推" | `市场${3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export function layerLabel(layer: number): LayerLabel | "—" {
  if (layer === 1) return "直推";
  if (layer === 2) return "间推";
  if (layer >= 3 && layer <= 9) return `市场${layer as 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
  return "—";
}

export type LeaderboardRow = {
  rank: number;
  address: string;
  directs: number;
};

export type LeaderboardResponse = {
  source: ApiSource;
  updatedAt: string;
  items: LeaderboardRow[];
};

export type TeamResponse = {
  source: ApiSource;
  address: string;
  directs: number;
  indirects: number;
  buyVolumeUsd: string;
  umbrellaUsd: string;
};

export type EarningsRow = {
  id: string;
  label: string;
  amount: string;
  at: string;
  layer?: number;
};

export type EarningsResponse = {
  source: ApiSource;
  address: string;
  swapPromoTotal: string;
  swapPromoRows: EarningsRow[];
  layerTotal: { 直推: string; 间推: string; 市场: string };
  layerRows: EarningsRow[];
  dividendTotal: string;
  dividendRows: EarningsRow[];
};

export type AnnouncementsResponse = {
  source: "static";
  banners: { id: string; title: string; subtitle: string; tone: string }[];
  announcements: { id: string; text: string }[];
  tokenIntro: string;
  dappRules: string[];
};

export type StatsResponse = {
  source: ApiSource;
  priceUsd: string | null;
  totalBurnedToken: string | null;
  totalBurnedUsd: string | null;
};
