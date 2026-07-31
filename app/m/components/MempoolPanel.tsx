"use client";

import { useMemo, useState } from "react";
import { Activity, ExternalLink, Search } from "lucide-react";
import MiniCard from "./MiniCard";
import EmptyState from "./EmptyState";
import { useMiniI18n } from "../lib/MiniI18n";
import { hapticImpact } from "../../lib/telegram";

export type MiniMempoolTx = {
  id: string;
  size?: number | null;
  inputs?: number | null;
  outputs?: number | null;
  ergNano?: string | number | null;
  tokens?: Array<{ tokenId?: string; amount?: string }> | null;
  pending?: boolean;
};

function shortId(id: string): string {
  if (!id || id.length < 16) return id || "—";
  return `${id.slice(0, 10)}…${id.slice(-6)}`;
}

function fmtErg(nano: string | number | null | undefined): string {
  if (nano == null || nano === "") return "—";
  try {
    const n = typeof nano === "string" ? BigInt(nano) : BigInt(Math.floor(nano));
    const erg = Number(n) / 1e9;
    if (!Number.isFinite(erg)) return "—";
    if (erg < 0.001) return `${erg.toFixed(6)} ERG`;
    if (erg < 1) return `${erg.toFixed(4)} ERG`;
    if (erg < 1000) return `${erg.toFixed(2)} ERG`;
    return `${Math.round(erg).toLocaleString()} ERG`;
  } catch {
    return "—";
  }
}

const DOT = [
  "#00E5FF",
  "#FF7A3D",
  "#10B981",
  "#A78BFA",
  "#F59E0B",
  "#38BDF8",
] as const;

function colorFor(id: string, i: number): string {
  let h = 0;
  for (let k = 0; k < Math.min(id.length, 12); k++) {
    h = (h * 31 + id.charCodeAt(k)) >>> 0;
  }
  return DOT[h % DOT.length] || DOT[i % DOT.length];
}

export default function MempoolPanel({
  size,
  txs,
  loading,
  source,
}: {
  size: number;
  txs: MiniMempoolTx[];
  loading?: boolean;
  source?: string;
}) {
  const { t } = useMiniI18n();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return txs;
    return txs.filter((tx) => (tx.id || "").toLowerCase().includes(s));
  }, [txs, q]);

  const totalErg = useMemo(() => {
    let sum = BigInt(0);
    for (const tx of txs) {
      if (tx.ergNano == null) continue;
      try {
        sum +=
          typeof tx.ergNano === "string"
            ? BigInt(tx.ergNano)
            : BigInt(Math.floor(Number(tx.ergNano)));
      } catch {
        /* */
      }
    }
    return sum;
  }, [txs]);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-20 rounded-2xl border border-white/[0.06] bg-white/[0.03] animate-pulse" />
        <div className="h-16 rounded-2xl border border-white/[0.06] bg-white/[0.03] animate-pulse" />
        <div className="h-16 rounded-2xl border border-white/[0.06] bg-white/[0.03] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <MiniCard>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl border border-[#00E5FF]/30 bg-[#00E5FF]/10 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-[#00E5FF]" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono tracking-[0.16em] text-[#00E5FF]">
                {t("mp_title")}
              </div>
              <div className="text-2xl font-mono tabular-nums text-white leading-none mt-0.5">
                {size}
              </div>
              <div className="text-[10px] font-mono text-[#6B6B78] mt-1">
                {t("mp_pending")}
                {source ? ` · ${source}` : ""}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[9px] font-mono text-[#6B6B78] uppercase tracking-wider">
              {t("mp_volume")}
            </div>
            <div className="mt-0.5 font-mono text-sm tabular-nums text-[#E8E8F0]">
              {fmtErg(totalErg.toString())}
            </div>
          </div>
        </div>
      </MiniCard>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A0A0B0]" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("mp_search")}
          className="w-full h-11 rounded-2xl border border-white/10 bg-black/30 pl-9 pr-3 font-mono text-[12px] text-[#E8E8F0] placeholder:text-[#A0A0B0]/70 outline-none focus:border-[#00E5FF]/35"
        />
      </div>

      <p className="text-[11px] font-mono text-[#A0A0B0]">
        {t("mp_showing", {
          n: filtered.length,
          total: txs.length,
        })}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title={q.trim() ? t("mp_empty_search") : t("mp_empty")}
          body={q.trim() ? t("mp_empty_search_body") : t("mp_empty_body")}
          icon={<Activity className="w-4 h-4" />}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((tx, i) => {
            const tokN = tx.tokens?.length ?? 0;
            return (
              <MiniCard
                key={tx.id || i}
                onClick={() => {
                  void hapticImpact("light");
                  try {
                    window.open(
                      `https://sigmaspace.io/en/transaction/${tx.id}`,
                      "_blank",
                      "noopener,noreferrer"
                    );
                  } catch {
                    /* */
                  }
                }}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                    style={{ background: colorFor(tx.id, i) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] text-[#E8E8F0] truncate">
                        {shortId(tx.id)}
                      </span>
                      <ExternalLink className="w-3 h-3 text-[#6B6B78] shrink-0" />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-[#A0A0B0]">
                      <span className="text-[#00E5FF]">
                        {fmtErg(tx.ergNano)}
                      </span>
                      {tx.inputs != null ? (
                        <span>
                          {tx.inputs}→{tx.outputs ?? "?"}
                        </span>
                      ) : null}
                      {tx.size != null ? <span>{tx.size} B</span> : null}
                      {tokN > 0 ? (
                        <span>
                          {tokN} {t("mp_tokens")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </MiniCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
