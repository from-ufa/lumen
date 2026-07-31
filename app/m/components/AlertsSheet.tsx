"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  Bell,
  BellOff,
  CheckCircle2,
  Server,
  LineChart,
  X,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { hapticImpact, hapticNotification } from "../../lib/telegram";
import { sheetSpring, sheetVariants } from "../lib/motion";
import { useMiniI18n } from "../lib/MiniI18n";

type StateEntry = {
  status?: string;
  since?: number;
  lastNotifiedAt?: number | null;
  meta?: { height?: number | null; peers?: number | null } | null;
};

type SubView = {
  id?: string;
  scopes?: { node?: boolean; oracle?: boolean };
  prefs?: {
    enabled?: boolean;
    claimReminder?: boolean;
    claimMinTokens?: number;
    minPeers?: number;
    postLagBlocks?: number;
  };
  lastTickAt?: string | null;
  lastError?: string | null;
  stateSummary?: Record<string, StateEntry>;
  tokenFp?: string;
};

type MeResponse = {
  ok?: boolean;
  hasChat?: boolean;
  disabled?: boolean;
  error?: string;
  subscriptions?: SubView[];
};

function ScopeToggle({
  on,
  label,
  sub,
  icon,
  disabled,
  onChange,
}: {
  on: boolean;
  label: string;
  sub: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onChange(!on);
        void hapticImpact("light");
      }}
      className={`flex-1 rounded-2xl border px-3 py-3 text-left disabled:opacity-40 ${
        on
          ? "border-[#FF7A3D]/40 bg-[#FF7A3D]/10"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={on ? "text-[#FF7A3D]" : "text-[#A0A0B0]"}>{icon}</span>
        <span className="text-sm font-medium text-[#E8E8F0]">{label}</span>
      </div>
      <p className="mt-1 text-[10px] text-[#A0A0B0] leading-snug">{sub}</p>
      <div
        className={`mt-2 text-[9px] font-mono tracking-wider ${
          on ? "text-[#10B981]" : "text-[#6B6B78]"
        }`}
      >
        {on ? "ON" : "OFF"}
      </div>
    </button>
  );
}

function StatusRow({
  label,
  status,
}: {
  label: string;
  status: string | undefined;
}) {
  const s = (status || "unknown").toLowerCase();
  const color =
    s === "ok"
      ? "#10B981"
      : s === "bad"
        ? "#EF4444"
        : "#6B6B78";
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-white/[0.05] last:border-0">
      <span className="text-[11px] text-[#A0A0B0] truncate">{label}</span>
      <span
        className="text-[10px] font-mono tracking-wider shrink-0"
        style={{ color }}
      >
        {s === "ok" ? "OK" : s === "bad" ? "ALERT" : "—"}
      </span>
    </div>
  );
}

export default function AlertsSheet({
  open,
  onClose,
  bridgeToken,
}: {
  open: boolean;
  onClose: () => void;
  bridgeToken: string;
}) {
  const reduce = useReducedMotion();
  const { t } = useMiniI18n();
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(false);
  const [scopeNode, setScopeNode] = useState(true);
  const [scopeOracle, setScopeOracle] = useState(true);
  const [minPeers, setMinPeers] = useState(3);
  const [postLag, setPostLag] = useState(24);
  const [hasChat, setHasChat] = useState<boolean | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [sub, setSub] = useState<SubView | null>(null);

  const refresh = useCallback(async () => {
    if (!bridgeToken) {
      setOn(false);
      setHasChat(null);
      setSub(null);
      setHint(t("hint_save_token"));
      return;
    }
    try {
      const res = await fetch("/api/tg/alerts/me", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as MeResponse;
      if (data.disabled) {
        setHint(t("hint_bot_off"));
        return;
      }
      if (!res.ok) {
        setHasChat(false);
        setOn(false);
        setSub(null);
        setHint(
          data.error === "auth_required"
            ? t("hint_auth")
            : data.error || t("hint_load_fail")
        );
        return;
      }
      setHasChat(!!data.hasChat);
      const first = (data.subscriptions || [])[0] || null;
      setSub(first);
      const enabled = !!first?.prefs?.enabled;
      setOn(enabled);
      if (first?.scopes) {
        setScopeNode(first.scopes.node !== false);
        setScopeOracle(first.scopes.oracle !== false);
      }
      if (typeof first?.prefs?.minPeers === "number") {
        setMinPeers(first.prefs.minPeers);
      }
      if (typeof first?.prefs?.postLagBlocks === "number") {
        setPostLag(first.prefs.postLagBlocks);
      }
      if (!data.hasChat) setHint(t("hint_start_bot"));
      else if (enabled) setHint(t("hint_watchdog_on"));
      else setHint(t("hint_opt_in"));
    } catch {
      setHint(t("hint_network"));
    }
  }, [bridgeToken, t]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const saveSubscribe = async (opts: {
    enabled: boolean;
    sendTest?: boolean;
  }) => {
    if (!bridgeToken || busy) return;
    if (!opts.enabled) {
      setBusy(true);
      try {
        const res = await fetch("/api/tg/alerts/unsubscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mute: true }),
        });
        if (!res.ok) {
          toast.error(t("toast_could_mute"));
          return;
        }
        setOn(false);
        setHint(t("hint_muted"));
        toast.message(t("toast_alerts_muted"));
        void hapticImpact("light");
        await refresh();
      } catch {
        toast.error(t("toast_network"));
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/tg/alerts/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bridgeToken,
          scopes: { node: scopeNode, oracle: scopeOracle },
          prefs: {
            enabled: true,
            minPeers,
            postLagBlocks: postLag,
          },
          sendTest: opts.sendTest !== false,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        hint?: string;
        testSent?: boolean;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.hint || data.error || t("toast_could_enable"));
        void hapticNotification("error");
        return;
      }
      setOn(true);
      setHasChat(true);
      setHint(
        data.testSent
          ? t("hint_enabled_test")
          : data.hint || t("hint_alerts_on")
      );
      toast.success(t("toast_alerts_on"));
      void hapticNotification("success");
      await refresh();
    } catch {
      toast.error(t("toast_network"));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tg/alerts/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error || t("toast_test_failed"));
        void hapticNotification("error");
        return;
      }
      toast.success(t("toast_test_sent"));
      void hapticNotification("success");
    } catch {
      toast.error(t("toast_network"));
    } finally {
      setBusy(false);
    }
  };

  const state = sub?.stateSummary || {};
  const liveRows = useMemo(() => {
    const pick = (key: string, label: string) => ({
      key,
      label,
      status: state[key]?.status,
    });
    return [
      pick("bridge.offline", t("al_st_bridge")),
      pick("node.unreachable", t("al_st_node")),
      pick("node.peers_low", t("al_st_peers")),
      pick("node.sync_lag", t("al_st_sync")),
      pick("node.height_stuck", t("al_st_height")),
    ].concat(
      Object.keys(state)
        .filter((k) => k.startsWith("oracle."))
        .slice(0, 6)
        .map((k) => ({
          key: k,
          label: k
            .replace("oracle.agent_down:", "Ora DOWN · ")
            .replace("oracle.post_lag:", "Ora lag · ")
            .replace("oracle.low_gas:", "Ora gas · ")
            .replace("oracle.missed_refresh:", "Ora miss · "),
          status: state[k]?.status,
        }))
    );
  }, [state, t]);

  const badCount = liveRows.filter((r) => r.status === "bad").length;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label={t("close_aria")}
            className="fixed inset-0 z-[80] bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.01 : 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-label={t("alerts_sheet_title")}
            className="fixed inset-x-0 bottom-0 z-[90] max-h-[90dvh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#12121A] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            variants={reduce ? undefined : sheetVariants}
            initial={reduce ? false : "hidden"}
            animate="visible"
            exit="exit"
            transition={sheetSpring}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#FF7A3D]" />
                <h2 className="text-base font-semibold tracking-tight">
                  {t("alerts_sheet_title")}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-10 w-10 inline-flex items-center justify-center rounded-full border border-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[12px] text-[#A0A0B0] leading-relaxed mb-4">
              {t("alerts_intro_rich")}
            </p>

            {/* Master switch */}
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 mb-3">
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {t("watchdog")}
                  {on && badCount > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-[#EF4444]">
                      <AlertTriangle className="w-3 h-3" />
                      {badCount}
                    </span>
                  ) : on ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                  ) : null}
                </div>
                <div className="text-[11px] text-[#A0A0B0] mt-0.5">
                  {on ? t("armed") : t("off")}
                  {hasChat === false ? t("need_start") : ""}
                  {sub?.lastTickAt
                    ? ` · tick ${new Date(sub.lastTickAt).toLocaleTimeString()}`
                    : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={busy || !bridgeToken}
                onClick={() =>
                  void saveSubscribe({ enabled: !on, sendTest: !on })
                }
                className={`h-9 px-4 rounded-full font-mono text-[10px] tracking-wider border disabled:opacity-40 inline-flex items-center gap-1.5 ${
                  on
                    ? "border-[#10B981]/40 bg-[#10B981]/15 text-[#10B981]"
                    : "border-white/15 text-[#A0A0B0]"
                }`}
              >
                {busy ? "…" : on ? (
                  <>
                    <Bell className="w-3 h-3" /> {t("on")}
                  </>
                ) : (
                  <>
                    <BellOff className="w-3 h-3" /> {t("off_btn")}
                  </>
                )}
              </button>
            </div>

            {/* Scopes */}
            <p className="text-[10px] font-mono tracking-[0.14em] text-[#6B6B78] mb-2">
              {t("al_scopes")}
            </p>
            <div className="flex gap-2 mb-4">
              <ScopeToggle
                on={scopeNode}
                label={t("al_scope_node")}
                sub={t("al_scope_node_sub")}
                icon={<Server className="w-4 h-4" />}
                disabled={busy}
                onChange={setScopeNode}
              />
              <ScopeToggle
                on={scopeOracle}
                label={t("al_scope_oracle")}
                sub={t("al_scope_oracle_sub")}
                icon={<LineChart className="w-4 h-4" />}
                disabled={busy}
                onChange={setScopeOracle}
              />
            </div>

            {/* Prefs */}
            <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3 mb-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-mono text-[#A0A0B0]">
                    {t("al_min_peers")}
                  </div>
                  <div className="text-[9px] text-[#6B6B78]">
                    {t("al_min_peers_hint")}
                  </div>
                </div>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    className="h-8 w-8 rounded-lg border border-white/10 font-mono text-sm"
                    onClick={() => setMinPeers((n) => Math.max(0, n - 1))}
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-mono text-sm tabular-nums">
                    {minPeers}
                  </span>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-lg border border-white/10 font-mono text-sm"
                    onClick={() => setMinPeers((n) => Math.min(30, n + 1))}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-mono text-[#A0A0B0]">
                    {t("al_post_lag")}
                  </div>
                  <div className="text-[9px] text-[#6B6B78]">
                    {t("al_post_lag_hint")}
                  </div>
                </div>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    className="h-8 w-8 rounded-lg border border-white/10 font-mono text-sm"
                    onClick={() => setPostLag((n) => Math.max(6, n - 6))}
                  >
                    −
                  </button>
                  <span className="w-10 text-center font-mono text-sm tabular-nums">
                    {postLag}
                  </span>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-lg border border-white/10 font-mono text-sm"
                    onClick={() => setPostLag((n) => Math.min(120, n + 6))}
                  >
                    +
                  </button>
                </div>
              </div>
              {on ? (
                <button
                  type="button"
                  disabled={busy || !bridgeToken}
                  onClick={() =>
                    void saveSubscribe({ enabled: true, sendTest: false })
                  }
                  className="w-full h-10 rounded-xl border border-white/15 bg-white/[0.05] font-mono text-[10px] tracking-wider disabled:opacity-40"
                >
                  {t("al_save_prefs")}
                </button>
              ) : null}
            </div>

            {/* Catalog */}
            <p className="text-[10px] font-mono tracking-[0.14em] text-[#6B6B78] mb-2">
              {t("al_catalog")}
            </p>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 mb-4 text-[11px] text-[#A0A0B0] space-y-1.5 leading-snug">
              <div className="flex gap-2">
                <Activity className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#FF7A3D]" />
                <span>{t("al_cat_node")}</span>
              </div>
              <div className="flex gap-2">
                <LineChart className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#00E5FF]" />
                <span>{t("al_cat_oracle")}</span>
              </div>
              <p className="text-[10px] text-[#6B6B78] pt-1">{t("al_cat_edge")}</p>
            </div>

            {/* Live state */}
            {on && liveRows.length > 0 ? (
              <>
                <p className="text-[10px] font-mono tracking-[0.14em] text-[#6B6B78] mb-2">
                  {t("al_live_state")}
                </p>
                <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-1 mb-4">
                  {liveRows.map((r) => (
                    <StatusRow key={r.key} label={r.label} status={r.status} />
                  ))}
                </div>
              </>
            ) : null}

            {hint ? (
              <p className="text-[11px] font-mono text-[#A0A0B0] mb-4 leading-relaxed">
                {hint}
              </p>
            ) : null}

            {sub?.lastError ? (
              <p className="text-[10px] font-mono text-[#F59E0B] mb-3">
                last error: {sub.lastError}
              </p>
            ) : null}

            <button
              type="button"
              disabled={busy || !on}
              onClick={() => void sendTest()}
              className="w-full h-11 rounded-xl border border-white/15 bg-white/[0.06] font-mono text-[11px] tracking-wider disabled:opacity-40"
            >
              {t("send_test")}
            </button>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
