/** Shared oracle feed types for Constellation (from /api/oracles). */

export type FeedStatus = "live" | "stale" | "offline";

export interface OracleNodeFeed {
  address: string;
  height: number | null;
  status: FeedStatus;
}

export interface OracleHistoryPoint {
  t: number;
  price: number;
  rate: number;
  height: number;
}

export interface OracleFeedData {
  id: string;
  pair: string;
  title: string;
  subtitle?: string;
  accent: string;
  status: FeedStatus;
  price: number | null;
  priceLabel: string | null;
  priceAlt: string | null;
  unitLabel: string;
  epoch: number | null;
  epochLength: number;
  settlementHeight: number | null;
  tipHeight: number | null;
  ageBlocks: number | null;
  ageMs: number | null;
  activeOracles: number | null;
  totalOracles: number | null;
  nodes: OracleNodeFeed[];
  history: OracleHistoryPoint[];
  explorerUrl?: string | null;
  boxId?: string | null;
}

export interface OraclesApiResponse {
  generatedAt: number;
  tipHeight: number | null;
  avgBlockMs: number;
  feeds: OracleFeedData[];
  error?: string;
}
