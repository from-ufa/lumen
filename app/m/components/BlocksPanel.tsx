"use client";

import { useMemo, useState } from "react";
import { Box, ExternalLink, Search } from "lucide-react";
import MiniCard from "./MiniCard";
import EmptyState from "./EmptyState";
import { useMiniI18n } from "../lib/MiniI18n";
import { hapticImpact } from "../../lib/telegram";

export type MiniBlock = {
  id: string;
  height: number;
  timestamp?: number | null;
  txCount?: number | null;
  size?: number | null;
  miner?: string | null;
};

function shortId(id: string): string {
  if (!id || id.length < 16) return id || "—";
  return `${id.slice(0, 10)}…${id.slice(-6)}`;
}

function timeAgo(ts: number | null | undefined, now: number): string {
  if (ts == null || !Number.isFinite(ts)) return "—";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = Math.max(0, now - ms);
  if (d < 60_000) return `${Math.max(1, Math.round(d / 1000))}s`;
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h`;
  return `${Math.round(d / 86_400_000)}d`;
}

function formatTime(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return "";
  const ms = ts > 1e12 ? ts : ts * 1000;
  try {
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function BlocksPanel({
  blocks,
  loading,
  tipHeight,
  source,
}: {
  blocks: MiniBlock[];
  loading?: boolean;
  tipHeight?: number | null;
  source?: string;
}) {
  const { t } = useMiniI18n();
  const [q, setQ] = useState("");
  const now = Date.now();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return blocks;
    return blocks.filter(
      (b) =>
        String(b.height).includes(s) ||
        (b.id || "").toLowerCase().includes(s) ||
        (b.miner || "").toLowerCase().includes(s)
    );
  }, [blocks, q]);

  const tip = tipHeight ?? blocks[0]?.height ?? null;
  const avgTx =
    blocks.length > 0
      ? Math.round(
          blocks.reduce((a, b) => a + (b.txCount ?? 0), 0) / blocks.length
        )
      : null;

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-20 rounded-2xl border border-white/[0.06] bg-white/[0.03] animate-pulse" />
        <div className="h-14 rounded-2xl border border-white/[0.06] bg-white/[0.03] animate-pulse" />
        <div className="h-14 rounded-2xl border border-white/[0.06] bg-white/[0.03] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <MiniCard>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl border border-[#FF7A3D]/30 bg-[#FF7A3D]/10 flex items-center justify-center shrink-0">
              <Box className="w-4 h-4 text-[#FF7A3D]" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono tracking-[0.16em] text-[#FF7A3D]">
                {t("blk_title")}
              </div>
              <div className="text-2xl font-mono tabular-nums text-white leading-none mt-0.5">
                {tip != null ? tip.toLocaleString() : "—"}
              </div>
              <div className="text-[10px] font-mono text-[#6B6B78] mt-1">
                {t("blk_tip")}
                {source ? ` · ${source}` : ""}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[9px] font-mono text-[#6B6B78] uppercase tracking-wider">
              {t("blk_shown")}
            </div>
            <div className="mt-0.5 font-mono text-sm tabular-nums text-[#E8E8F0]">
              {blocks.length}
            </div>
            {avgTx != null ? (
              <div className="text-[9px] font-mono text-[#6B6B78]">
                ~{avgTx} tx
              </div>
            ) : null}
          </div>
        </div>
      </MiniCard>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A0A0B0]" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("blk_search")}
          className="w-full h-11 rounded-2xl border border-white/10 bg-black/30 pl-9 pr-3 font-mono text-[12px] text-[#E8E8F0] placeholder:text-[#A0A0B0]/70 outline-none focus:border-[#FF7A3D]/35"
        />
      </div>

      <p className="text-[11px] font-mono text-[#A0A0B0]">
        {t("blk_count", { n: filtered.length, total: blocks.length })}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title={q.trim() ? t("blk_empty_search") : t("blk_empty")}
          body={
            q.trim() ? t("blk_empty_search_body") : t("blk_empty_body")
          }
          icon={<Box className="w-4 h-4" />}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((b, i) => {
            const ago = timeAgo(b.timestamp, now);
            const clock = formatTime(b.timestamp);
            return (
              <MiniCard
                key={b.id || b.height || i}
                onClick={() => {
                  void hapticImpact("light");
                  if (!b.id) return;
                  try {
                    window.open(
                      `https://sigmaspace.io/en/block/${b.id}`,
                      "_blank",
                      "noopener,noreferrer"
                    );
                  } catch {
                    /* */
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[15px] font-semibold tabular-nums text-white">
                        #{b.height.toLocaleString()}
                      </span>
                      {i === 0 && !q.trim() ? (
                        <span className="text-[8px] font-mono tracking-wider text-[#10B981] border border-[#10B981]/35 px-1.5 py-0.5 rounded-full">
                          TIP
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-[#A0A0B0] truncate">
                      {shortId(b.id)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-[#A0A0B0]">
                      {b.txCount != null ? (
                        <span className="text-[#FF7A3D]">
                          {b.txCount} tx
                        </span>
                      ) : null}
                      {b.size != null ? <span>{b.size} B</span> : null}
                      <span className="text-[#00E5FF]">{ago} ago</span>
                      {clock ? <span>{clock}</span> : null}
                      {b.miner ? (
                        <span className="truncate max-w-[40%]">
                          {b.miner}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {b.id ? (
                    <ExternalLink className="w-3.5 h-3.5 text-[#6B6B78] shrink-0 mt-1" />
                  ) : null}
                </div>
              </MiniCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
