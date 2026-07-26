/** Shared oracle feed types for Constellation (from /api/oracles). */

export type FeedStatus = "live" | "stale" | "offline";

export type OracleLiveEventKind =
  | "datapoint"
  | "pool_refresh"
  | "reward"
  | "rate_change";

export interface OracleLiveEvent {
  id: string;
  t: number;
  kind: OracleLiveEventKind;
  address?: string;
  height?: number | null;
  rewardDelta?: number | null;
  message: string;
}

export interface OracleNodeFeed {
  address: string;
  height: number | null;
  collectedHeight?: number | null;
  rewardTokens?: number | null;
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
  statusThresholds?: { liveMax: number; staleMax: number };
  price: number | null;
  priceLabel: string | null;
  priceAlt: string | null;
  rateNano?: number | null;
  unitLabel: string;
  epoch: number | null;
  epochLength: number;
  settlementHeight: number | null;
  tipHeight: number | null;
  ageBlocks: number | null;
  ageMs: number | null;
  activeOracles: number | null;
  totalOracles: number | null;
  requiredOracles?: number | null;
  poolHealthy?: boolean | null;
  poolRewardTokens?: number | null;
  nodes: OracleNodeFeed[];
  history: OracleHistoryPoint[];
  liveEvents?: OracleLiveEvent[];
  explorerUrl?: string | null;
  boxId?: string | null;
}

export interface OraclesApiResponse {
  generatedAt: number;
  tipHeight: number | null;
  avgBlockMs: number;
  feeds: OracleFeedData[];
  view?: "network" | "my";
  bridge?: {
    connected: boolean;
    version?: string | null;
    oraclesConfigured: string[];
    error?: string;
  };
  error?: string;
}
