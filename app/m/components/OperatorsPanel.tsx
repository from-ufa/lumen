"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import MiniCard from "./MiniCard";
import EmptyState from "./EmptyState";
import { useMiniI18n } from "../lib/MiniI18n";
import type { OracleFeedRich } from "./OracleFeedCards";
import { hapticImpact } from "../../lib/telegram";

type OpRow = {
  key: string;
  feedId: string;
  pair: string;
  accent: string;
  address: string;
  status: string;
  height: number | null;
  rewardTokens: number | null;
  isMine: boolean;
  idleKey: boolean;
  detail: string | null;
};

function shortAddr(a: string): string {
  if (!a || a.length < 14) return a || "—";
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

function isOnline(status: string, idleKey: boolean): boolean {
  const s = status.toLowerCase();
  if (idleKey) return false;
  return s === "live" || s === "active" || s === "posting";
}

function statusTone(online: boolean, idleKey: boolean): {
  label: string;
  color: string;
} {
  if (idleKey) return { label: "IDLE", color: "#F59E0B" };
  if (online) return { label: "LIVE", color: "#10B981" };
  return { label: "OFF", color: "#EF4444" };
}

export default function OperatorsPanel({
  feeds,
  loading,
  /** Personal MY session with bridge token — only then isMine → YOU */
  personal = false,
}: {
  feeds: OracleFeedRich[];
  loading?: boolean;
  personal?: boolean;
}) {
  const { t } = useMiniI18n();
  const [filter, setFilter] = useState<"all" | "live" | "off">("all");
  const [feedId, setFeedId] = useState<string>("all");
  const [q, setQ] = useState("");

  const rows: OpRow[] = useMemo(() => {
    const out: OpRow[] = [];
    for (const f of feeds) {
      const pair = f.pair || f.title || f.id;
      const accent = f.accent || "#00E5FF";
      for (const n of f.nodes || []) {
        if (!n.address) continue;
        out.push({
          key: `${f.id}:${n.address}`,
          feedId: f.id,
          pair,
          accent,
          address: n.address,
          status: n.status || (n.idleKey ? "offline" : "unknown"),
          height: n.height ?? null,
          rewardTokens: n.rewardTokens ?? null,
          isMine: !!n.isMine,
          idleKey: !!(n as { idleKey?: boolean }).idleKey,
          detail: n.detail ?? null,
        });
      }
    }
    // LIVE first, then mine, then rewards
    out.sort((a, b) => {
      const ao = isOnline(a.status, a.idleKey) ? 0 : 1;
      const bo = isOnline(b.status, b.idleKey) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
      return (b.rewardTokens ?? 0) - (a.rewardTokens ?? 0);
    });
    return out;
  }, [feeds]);

  const stats = useMemo(() => {
    let live = 0;
    let off = 0;
    let idle = 0;
    for (const r of rows) {
      if (r.idleKey) idle += 1;
      else if (isOnline(r.status, false)) live += 1;
      else off += 1;
    }
    return { live, off, idle, total: rows.length };
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (feedId !== "all" && r.feedId !== feedId) return false;
      const online = isOnline(r.status, r.idleKey);
      if (filter === "live" && !online) return false;
      if (filter === "off" && online) return false;
      if (!s) return true;
      return (
        r.address.toLowerCase().includes(s) ||
        r.pair.toLowerCase().includes(s) ||
        (r.detail || "").toLowerCase().includes(s)
      );
    });
  }, [rows, filter, feedId, q]);

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
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-[#FF7A3D]" />
          <span className="text-[10px] font-mono tracking-[0.16em] text-[#FF7A3D]">
            {t("ops_title")}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-[#10B981]/25 bg-[#10B981]/10 px-2 py-2 text-center">
            <div className="text-[9px] font-mono text-[#10B981]">LIVE</div>
            <div className="text-xl font-mono tabular-nums text-white">
              {stats.live}
            </div>
          </div>
          <div className="rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/10 px-2 py-2 text-center">
            <div className="text-[9px] font-mono text-[#EF4444]">OFF</div>
            <div className="text-xl font-mono tabular-nums text-white">
              {stats.off}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center">
            <div className="text-[9px] font-mono text-[#A0A0B0]">ALL</div>
            <div className="text-xl font-mono tabular-nums text-white">
              {stats.total}
            </div>
          </div>
        </div>
        {stats.idle > 0 ? (
          <p className="mt-2 text-[10px] font-mono text-[#F59E0B]">
            {t("ops_idle_keys", { n: stats.idle })}
          </p>
        ) : null}
      </MiniCard>

      {/* Per-pool mini strip */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
        <button
          type="button"
          onClick={() => {
            setFeedId("all");
            void hapticImpact("light");
          }}
          className={`shrink-0 h-8 px-3 rounded-full text-[10px] font-mono border ${
            feedId === "all"
              ? "border-white/20 bg-white/10 text-white"
              : "border-white/10 text-[#A0A0B0]"
          }`}
        >
          {t("ops_all_pools")}
        </button>
        {feeds.map((f) => {
          const ns = f.nodes || [];
          const live = ns.filter((n) =>
            isOnline(n.status || "", !!(n as { idleKey?: boolean }).idleKey)
          ).length;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFeedId(f.id);
                void hapticImpact("light");
              }}
              className={`shrink-0 h-8 px-3 rounded-full text-[10px] font-mono border ${
                feedId === f.id
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/10 text-[#A0A0B0]"
              }`}
              style={
                feedId === f.id
                  ? { borderColor: `${f.accent || "#00E5FF"}55` }
                  : undefined
              }
            >
              {(f.pair || f.id).replace("ERG/", "")} {live}/{ns.length}
            </button>
          );
        })}
      </div>

      <div className="inline-flex rounded-full border border-white/10 p-0.5 bg-black/20">
        {(["all", "live", "off"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFilter(f);
              void hapticImpact("light");
            }}
            className={`h-8 px-3 rounded-full text-[10px] font-mono tracking-wider ${
              filter === f ? "bg-white/10 text-white" : "text-[#A0A0B0]"
            }`}
          >
            {f === "all"
              ? t("filter_all")
              : f === "live"
                ? t("filter_live")
                : t("ops_filter_off")}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A0A0B0]" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("ops_search")}
          className="w-full h-11 rounded-2xl border border-white/10 bg-black/30 pl-9 pr-3 font-mono text-[12px] text-[#E8E8F0] placeholder:text-[#A0A0B0]/70 outline-none focus:border-[#FF7A3D]/35"
        />
      </div>

      <p className="text-[11px] font-mono text-[#A0A0B0]">
        {t("ops_count", { n: filtered.length, total: rows.length })}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title={t("ops_empty")}
          body={t("ops_empty_body")}
          icon={<Users className="w-4 h-4" />}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const online = isOnline(r.status, r.idleKey);
            const tone = statusTone(online, r.idleKey);
            return (
              <MiniCard key={r.key}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="text-[10px] font-mono tracking-wider"
                        style={{ color: r.accent }}
                      >
                        {r.pair}
                      </span>
                      {r.isMine ? (
                        <span
                          className={`text-[8px] font-mono px-1.5 py-0.5 rounded-full border ${
                            personal
                              ? "border-[#FF7A3D]/40 text-[#FF7A3D]"
                              : "border-[#00E5FF]/40 text-[#00E5FF]"
                          }`}
                        >
                          {personal ? t("ora_badge_you") : t("ora_badge_lumen")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 font-mono text-[12px] text-[#E8E8F0] truncate">
                      {shortAddr(r.address)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-[#A0A0B0]">
                      {r.height != null ? (
                        <span>h {r.height.toLocaleString()}</span>
                      ) : null}
                      {r.rewardTokens != null ? (
                        <span className="text-[#E8C547]">
                          {r.rewardTokens.toLocaleString()} rw
                        </span>
                      ) : null}
                      {r.detail ? <span>{r.detail}</span> : null}
                    </div>
                  </div>
                  <span
                    className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-mono tracking-wider border"
                    style={{
                      color: tone.color,
                      borderColor: `${tone.color}55`,
                      background: `${tone.color}14`,
                    }}
                  >
                    {tone.label}
                  </span>
                </div>
              </MiniCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
