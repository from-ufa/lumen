"use client";

import { ExternalLink } from "lucide-react";
import MiniCard from "./MiniCard";
import { useMiniI18n } from "../lib/MiniI18n";

export type OracleMyOperator = {
  address?: string | null;
  isHealthy?: boolean | null;
  claimableRewards?: number | null;
  rewardsDelta?: number | null;
  walletErg?: number | null;
  walletRewardTokens?: number | null;
  totalEarnedTokens?: number | null;
  postHeight?: number | null;
  collectedHeight?: number | null;
  postAgeBlocks?: number | null;
  collectedAgeBlocks?: number | null;
  inLastRefresh?: boolean | null;
};

export type OracleFeedRich = {
  id: string;
  title?: string;
  pair?: string;
  subtitle?: string;
  price?: number | null;
  priceLabel?: string | null;
  priceChange24h?: number | null;
  status?: string | null;
  statusThresholds?: { liveMax?: number; staleMax?: number };
  accent?: string;
  epoch?: number | null;
  epochLength?: number;
  settlementHeight?: number | null;
  tipHeight?: number | null;
  ageBlocks?: number | null;
  ageMs?: number | null;
  lastUpdatedAt?: number | null;
  activeOracles?: number | null;
  totalOracles?: number | null;
  requiredOracles?: number | null;
  poolHealthy?: boolean | null;
  poolRewardTokens?: number | null;
  rewardToken?: {
    id?: string;
    ticker?: string;
    name?: string;
    decimals?: number;
  } | null;
  rewardTokenPriceErg?: number | null;
  rewardTokenPriceUsd?: number | null;
  rewardTokensPerOraclePerEpoch?: number | null;
  epochsPerDay?: number | null;
  operatorDailyTokens?: number | null;
  operatorDailyErg?: number | null;
  operatorDailyUsd?: number | null;
  myOperator?: OracleMyOperator | null;
  scope?: "mine" | "network" | null;
  source?: string | null;
  explorerUrl?: string | null;
  nodes?: Array<{
    address?: string;
    height?: number | null;
    collectedHeight?: number | null;
    rewardTokens?: number | null;
    status?: string;
    isMine?: boolean;
    detail?: string | null;
  }>;
  history?: Array<{ price?: number | null } | number>;
};

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function fmtUsd(n: number | null | undefined, dig = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`;
  if (Math.abs(n) < 10) return `$${n.toFixed(dig)}`;
  return `$${n.toFixed(2)}`;
}

function fmtErg(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 0.01) return n.toFixed(4);
  if (n < 10) return n.toFixed(2);
  return n.toFixed(1);
}

function fmtTok(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return Math.round(n).toLocaleString();
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

function blockAgeLabel(
  blocks: number | null | undefined,
  avgBlockMs = 120_000
): { primary: string; secondary: string } {
  if (blocks == null || !Number.isFinite(blocks)) {
    return { primary: "—", secondary: "" };
  }
  const b = Math.max(0, Math.round(blocks));
  const ms = b * avgBlockMs;
  let primary: string;
  if (ms < 60_000) primary = `${Math.max(1, Math.round(ms / 1000))}s ago`;
  else if (ms < 3_600_000)
    primary = `${Math.max(1, Math.round(ms / 60_000))}m ago`;
  else if (ms < 86_400_000)
    primary = `${Math.max(1, Math.round(ms / 3_600_000))}h ago`;
  else primary = `${Math.max(1, Math.round(ms / 86_400_000))}d ago`;
  return { primary, secondary: `${b} blk` };
}

function statusStyle(status: string | null | undefined): {
  label: string;
  color: string;
  bg: string;
  border: string;
} {
  const s = (status || "").toLowerCase();
  if (s === "live") {
    return {
      label: "LIVE",
      color: "#10B981",
      bg: "rgba(16,185,129,0.12)",
      border: "rgba(16,185,129,0.35)",
    };
  }
  if (s === "stale") {
    return {
      label: "STALE",
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.12)",
      border: "rgba(245,158,11,0.35)",
    };
  }
  if (s === "offline" || s === "down") {
    return {
      label: s === "down" ? "DOWN" : "OFFLINE",
      color: "#EF4444",
      bg: "rgba(239,68,68,0.12)",
      border: "rgba(239,68,68,0.35)",
    };
  }
  return {
    label: (status || "—").toUpperCase(),
    color: "#A0A0B0",
    bg: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.1)",
  };
}

function StatCell({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/25 px-2 py-2">
      <div className="text-[8px] font-mono tracking-[0.12em] uppercase text-[#7A7A88] truncate">
        {label}
      </div>
      <div
        className="mt-1 font-mono text-[13px] font-semibold tabular-nums leading-none truncate"
        style={{ color: accent || "#E8E8F0" }}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-[9px] font-mono text-[#6B6B78] truncate">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Rich oracle feed card for Mini App — pool + operator economics.
 */
export default function OracleFeedCard({
  feed,
  showOperator,
  variant,
}: {
  feed: OracleFeedRich;
  /** Show myOperator / YOU panel when data present */
  showOperator: boolean;
  variant: "network" | "my";
}) {
  const { t } = useMiniI18n();
  const accent = feed.accent || "#00E5FF";
  const st = statusStyle(feed.status);
  const ticker = feed.rewardToken?.ticker || "—";
  const ch = feed.priceChange24h;
  const up = ch != null && ch >= 0;

  const priceDisplay =
    feed.priceLabel ||
    (feed.price != null && Number.isFinite(feed.price)
      ? feed.id.includes("usd") || (feed.pair || "").includes("USD")
        ? fmtUsd(feed.price, 4)
        : String(feed.price)
      : "—");

  const poolAge = blockAgeLabel(feed.ageBlocks);
  const mine = feed.myOperator;
  const mineNode = (feed.nodes || []).find((n) => n.isMine);
  const isMineScope = feed.scope === "mine" || variant === "my";

  const claim =
    mine?.claimableRewards ?? mineNode?.rewardTokens ?? null;
  const held = mine?.walletRewardTokens ?? null;
  const total =
    mine?.totalEarnedTokens ??
    (claim != null || held != null ? (claim ?? 0) + (held ?? 0) : null);
  const px = feed.rewardTokenPriceUsd;
  const toUsd = (n: number | null) =>
    n != null && px != null && Number.isFinite(n * px) ? n * px : null;

  const postAge = blockAgeLabel(mine?.postAgeBlocks);
  const collAge = blockAgeLabel(mine?.collectedAgeBlocks);

  const healthy = mine?.isHealthy;
  const inRefresh = mine?.inLastRefresh;

  const quorum =
    feed.activeOracles != null
      ? `${feed.activeOracles}${
          feed.requiredOracles != null ? `/${feed.requiredOracles}` : ""
        }${feed.totalOracles != null ? ` · ${feed.totalOracles}` : ""}`
      : "—";

  const dailyTok = feed.operatorDailyTokens;
  const dailyUsd = feed.operatorDailyUsd;
  const dailyErg = feed.operatorDailyErg;

  return (
    <MiniCard>
      {/* Header: pair + status + scope */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className="text-[10px] font-mono tracking-[0.16em]"
            style={{ color: accent }}
          >
            {feed.title || feed.pair || feed.id}
          </div>
          {feed.subtitle ? (
            <div className="text-[9px] font-mono text-[#6B6B78] mt-0.5 truncate">
              {feed.subtitle}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className="px-2 py-0.5 rounded-full text-[9px] font-mono tracking-wider border"
            style={{
              color: st.color,
              background: st.bg,
              borderColor: st.border,
            }}
          >
            {st.label}
          </span>
          {feed.scope === "mine" ? (
            <span className="text-[8px] font-mono tracking-wider text-[#FF7A3D]">
              {t("ora_scope_you")}
            </span>
          ) : feed.scope === "network" ? (
            <span className="text-[8px] font-mono tracking-wider text-[#00E5FF]">
              {t("ora_scope_lumen")}
            </span>
          ) : variant === "network" ? (
            <span className="text-[8px] font-mono tracking-wider text-[#00E5FF]">
              {t("ora_scope_lumen")}
            </span>
          ) : null}
        </div>
      </div>

      {/* Price */}
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="font-mono text-2xl tabular-nums text-white leading-none tracking-tight">
          {priceDisplay}
        </div>
        {ch != null && Number.isFinite(ch) ? (
          <div
            className={`text-[11px] font-mono tabular-nums ${
              up ? "text-[#10B981]" : "text-[#EF4444]"
            }`}
          >
            {up ? "+" : ""}
            {(ch * 100).toFixed(2)}%
          </div>
        ) : null}
      </div>

      {/* Pool health strip */}
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <StatCell
          label={t("ora_pool_age")}
          value={poolAge.primary}
          sub={poolAge.secondary || undefined}
          accent={
            (feed.ageBlocks ?? 0) >
            (feed.statusThresholds?.liveMax ?? 24)
              ? "#F59E0B"
              : "#E8E8F0"
          }
        />
        <StatCell
          label={t("ora_quorum")}
          value={quorum}
          sub={
            feed.poolHealthy === true
              ? t("ora_pool_ok")
              : feed.poolHealthy === false
                ? t("ora_pool_bad")
                : undefined
          }
          accent={
            feed.poolHealthy === false
              ? "#EF4444"
              : feed.poolHealthy === true
                ? "#10B981"
                : undefined
          }
        />
        <StatCell
          label={t("ora_epoch")}
          value={
            feed.epoch != null
              ? String(feed.epoch)
              : feed.epochLength
                ? `${feed.epochLength} blk`
                : "—"
          }
          sub={
            feed.settlementHeight != null
              ? `h ${feed.settlementHeight.toLocaleString()}`
              : feed.epochLength
                ? `${feed.epochLength} blk/ep`
                : undefined
          }
        />
      </div>

      {/* Rewards economics */}
      <div className="mt-2.5 rounded-xl border border-white/[0.07] bg-black/20 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[8px] font-mono tracking-[0.14em] uppercase text-[#7A7A88]">
            {t("ora_reward_token")}
          </div>
          <div className="text-[10px] font-mono text-[#E8E8F0] font-semibold">
            {ticker}
            {feed.rewardToken?.name ? (
              <span className="ml-1.5 text-[8px] font-normal text-[#6B6B78]">
                {feed.rewardToken.name.replace(/\s*Token\s*$/i, "")}
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] font-mono tabular-nums">
          <span className="text-[#E8E8F0]">
            {fmtErg(feed.rewardTokenPriceErg)} ERG
          </span>
          <span className="text-[#5C5C6A]">/</span>
          <span style={{ color: accent }}>
            {fmtUsd(feed.rewardTokenPriceUsd, 4)}
          </span>
          <span className="text-[8px] text-[#5C5C6A] uppercase tracking-wider">
            spot
          </span>
        </div>
        <div className="mt-2 pt-2 border-t border-white/[0.06] grid grid-cols-2 gap-2">
          <div>
            <div className="text-[8px] font-mono tracking-[0.12em] uppercase text-[#7A7A88]">
              {t("ora_op_day")}
            </div>
            <div className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums text-[#E8E8F0]">
              {dailyTok != null ? (
                <>
                  {fmtTok(dailyTok)}
                  <span className="text-[9px] text-[#7A7A88] ml-1 font-normal">
                    {ticker}
                  </span>
                </>
              ) : (
                "—"
              )}
            </div>
            <div className="text-[9px] font-mono text-[#6B6B78]">
              {dailyUsd != null
                ? `~${fmtUsd(dailyUsd)}`
                : dailyErg != null
                  ? `~${fmtErg(dailyErg)} ERG`
                  : t("ora_if_collected")}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[8px] font-mono tracking-[0.12em] uppercase text-[#7A7A88]">
              {t("ora_per_epoch")}
            </div>
            <div className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums text-[#E8E8F0]">
              {feed.rewardTokensPerOraclePerEpoch != null
                ? `${feed.rewardTokensPerOraclePerEpoch} ${ticker}`
                : "—"}
            </div>
            <div className="text-[9px] font-mono text-[#6B6B78]">
              {feed.epochsPerDay != null
                ? `~${
                    feed.epochsPerDay >= 10
                      ? Math.round(feed.epochsPerDay)
                      : feed.epochsPerDay.toFixed(1)
                  } ep/day`
                : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Operator panel — critical for MY and useful for LUMEN host */}
      {showOperator && (mine || mineNode) ? (
        <div
          className="mt-2.5 rounded-xl border border-[#FF7A3D]/25 px-2.5 py-2.5"
          style={{ background: "rgba(255,122,61,0.06)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[9px] font-mono tracking-[0.14em] uppercase text-[#FF7A3D]">
              {isMineScope || mineNode?.isMine
                ? t("ora_your_oracle")
                : t("ora_host_operator")}
            </div>
            <span
              className="px-2 py-0.5 rounded-full text-[8px] font-mono tracking-wider border"
              style={{
                color:
                  healthy === true
                    ? "#34D399"
                    : healthy === false
                      ? "#F87171"
                      : "#8B8B9A",
                borderColor:
                  healthy === true
                    ? "rgba(52,211,153,0.35)"
                    : healthy === false
                      ? "rgba(248,113,113,0.35)"
                      : "rgba(255,255,255,0.1)",
                background:
                  healthy === true ? "rgba(52,211,153,0.08)" : "transparent",
              }}
            >
              {healthy === true
                ? t("ora_healthy")
                : healthy === false
                  ? t("ora_down")
                  : "—"}
            </span>
          </div>

          {mine?.address || mineNode?.address ? (
            <div className="mt-1.5 text-[10px] font-mono text-[#A0A0B0] truncate">
              {(mine?.address || mineNode?.address || "").slice(0, 8)}…
              {(mine?.address || mineNode?.address || "").slice(-6)}
            </div>
          ) : null}

          {/* Claim / held / total */}
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <StatCell
              label={t("ora_to_claim")}
              value={
                claim != null
                  ? `${fmtInt(claim)}${
                      mine?.rewardsDelta != null && mine.rewardsDelta !== 0
                        ? mine.rewardsDelta > 0
                          ? ` +${mine.rewardsDelta}`
                          : ` ${mine.rewardsDelta}`
                        : ""
                    }`
                  : "—"
              }
              sub={
                toUsd(claim) != null
                  ? fmtUsd(toUsd(claim))
                  : ticker !== "—"
                    ? ticker
                    : undefined
              }
              accent="#E8C547"
            />
            <StatCell
              label={t("ora_in_wallet")}
              value={fmtInt(held)}
              sub={
                toUsd(held) != null
                  ? fmtUsd(toUsd(held))
                  : ticker !== "—"
                    ? ticker
                    : undefined
              }
              accent="#FFB48A"
            />
            <StatCell
              label={t("ora_total_est")}
              value={fmtInt(total)}
              sub={
                toUsd(total) != null
                  ? fmtUsd(toUsd(total))
                  : t("ora_held_plus_claim")
              }
              accent="#FF7A3D"
            />
          </div>

          {/* Publish / gas / refresh */}
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <StatCell
              label={t("ora_last_publish")}
              value={postAge.primary}
              sub={
                postAge.secondary ||
                (mine?.postHeight != null
                  ? `h ${mine.postHeight}`
                  : mineNode?.height != null
                    ? `h ${mineNode.height}`
                    : undefined)
              }
              accent="#FF7A3D"
            />
            <StatCell
              label={t("ora_gas_wallet")}
              value={
                mine?.walletErg != null
                  ? `${fmtErg(mine.walletErg)} ERG`
                  : "—"
              }
              sub={t("ora_for_posting")}
              accent={
                mine?.walletErg != null && mine.walletErg < 0.5
                  ? "#F59E0B"
                  : undefined
              }
            />
            <StatCell
              label={t("ora_in_refresh")}
              value={
                inRefresh === true
                  ? t("ora_yes")
                  : inRefresh === false
                    ? t("ora_no")
                    : "—"
              }
              sub={
                collAge.primary !== "—"
                  ? collAge.primary
                  : mine?.collectedHeight != null
                    ? `h ${mine.collectedHeight}`
                    : undefined
              }
              accent={
                inRefresh === true
                  ? "#10B981"
                  : inRefresh === false
                    ? "#EF4444"
                    : undefined
              }
            />
          </div>

          {mineNode?.detail ? (
            <div className="mt-2 text-[10px] font-mono text-[#A0A0B0]">
              {t("ora_detail")}: {mineNode.detail}
            </div>
          ) : null}
        </div>
      ) : showOperator && variant === "my" ? (
        <div className="mt-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2.5">
          <p className="text-[11px] text-[#A0A0B0] leading-relaxed">
            {t("ora_no_operator_data")}
          </p>
        </div>
      ) : null}

      {/* Footer: tip / source / explorer */}
      <div className="mt-2.5 flex items-center justify-between gap-2 text-[9px] font-mono text-[#6B6B78]">
        <span className="truncate">
          {feed.tipHeight != null
            ? `tip ${feed.tipHeight.toLocaleString()}`
            : ""}
          {feed.source ? ` · ${feed.source}` : ""}
        </span>
        {feed.explorerUrl ? (
          <a
            href={feed.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#00E5FF]/80 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {t("ora_explorer")}
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : null}
      </div>
    </MiniCard>
  );
}
