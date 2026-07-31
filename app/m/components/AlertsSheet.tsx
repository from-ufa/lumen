"use client";

/**
 * Unified Alerts hub — one place for all TG notifications.
 * Master on/off · per-type toggles · scopes · live state · test.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bell,
  BellOff,
  CheckCircle2,
  Fuel,
  GitBranch,
  Link2,
  LineChart,
  Radio,
  Server,
  Timer,
  Waves,
  X,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { hapticImpact, hapticNotification } from "../../lib/telegram";
import { ALERT_CATALOG, type AlertCatalogId } from "../../lib/tg-alerts-catalog";
import { sheetSpring, sheetVariants } from "../lib/motion";
import { useMiniI18n } from "../lib/MiniI18n";
import type { MiniMsgKey } from "../lib/i18n";

type StateEntry = {
  status?: string;
  since?: number;
  lastNotifiedAt?: number | null;
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
    muted?: string[];
  };
  lastTickAt?: string | null;
  lastError?: string | null;
  stateSummary?: Record<string, StateEntry>;
};

type MeResponse = {
  ok?: boolean;
  hasChat?: boolean;
  disabled?: boolean;
  error?: string;
  subscriptions?: SubView[];
};

const ICONS: Record<
  AlertCatalogId,
  typeof Bell
> = {
  "bridge.offline": Link2,
  "node.unreachable": Server,
  "node.peers_low": Radio,
  "node.sync_lag": GitBranch,
  "node.height_stuck": Timer,
  "oracle.agent_down": LineChart,
  "oracle.post_lag": Waves,
  "oracle.missed_refresh": Activity,
  "oracle.low_gas": Fuel,
};

const TITLE_KEY: Record<AlertCatalogId, MiniMsgKey> = {
  "bridge.offline": "al_item_bridge",
  "node.unreachable": "al_item_unreachable",
  "node.peers_low": "al_item_peers",
  "node.sync_lag": "al_item_sync",
  "node.height_stuck": "al_item_stuck",
  "oracle.agent_down": "al_item_ora_down",
  "oracle.post_lag": "al_item_ora_lag",
  "oracle.missed_refresh": "al_item_ora_miss",
  "oracle.low_gas": "al_item_ora_gas",
};

const BODY_KEY: Record<AlertCatalogId, MiniMsgKey> = {
  "bridge.offline": "al_item_bridge_b",
  "node.unreachable": "al_item_unreachable_b",
  "node.peers_low": "al_item_peers_b",
  "node.sync_lag": "al_item_sync_b",
  "node.height_stuck": "al_item_stuck_b",
  "oracle.agent_down": "al_item_ora_down_b",
  "oracle.post_lag": "al_item_ora_lag_b",
  "oracle.missed_refresh": "al_item_ora_miss_b",
  "oracle.low_gas": "al_item_ora_gas_b",
};

function Toggle({
  on,
  disabled,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => {
        onChange(!on);
        void hapticImpact("light");
      }}
      className={`relative h-7 w-12 rounded-full border transition-colors disabled:opacity-40 ${
        on
          ? "border-[#10B981]/50 bg-[#10B981]/30"
          : "border-white/15 bg-white/[0.06]"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? "left-6" : "left-0.5"
        }`}
      />
    </button>
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
  const [muted, setMuted] = useState<string[]>([]);
  const [hasChat, setHasChat] = useState<boolean | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [sub, setSub] = useState<SubView | null>(null);
  const [dirty, setDirty] = useState(false);

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
      setMuted(
        Array.isArray(first?.prefs?.muted) ? [...first!.prefs!.muted!] : []
      );
      setDirty(false);
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

  const setMutedId = (id: string, enabled: boolean) => {
    setMuted((prev) => {
      const set = new Set(prev);
      if (enabled) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
    setDirty(true);
  };

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
            muted,
          },
          sendTest: opts.sendTest === true,
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
      setDirty(false);
      setHint(
        data.testSent
          ? t("hint_enabled_test")
          : data.hint || t("hint_alerts_on")
      );
      toast.success(
        opts.sendTest ? t("toast_alerts_on") : t("al_saved")
      );
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
    if (!on) {
      await saveSubscribe({ enabled: true, sendTest: true });
      return;
    }
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
  const badCount = useMemo(
    () =>
      Object.values(state).filter((s) => s.status === "bad").length,
    [state]
  );

  const groups = [
    {
      id: "bridge" as const,
      title: t("al_grp_bridge"),
      color: "#FF7A3D",
    },
    {
      id: "node" as const,
      title: t("al_grp_node"),
      color: "#00E5FF",
    },
    {
      id: "oracle" as const,
      title: t("al_grp_oracle"),
      color: "#10B981",
    },
  ];

  const enabledCount = ALERT_CATALOG.filter((c) => !muted.includes(c.id))
    .length;

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
            className="fixed inset-x-0 bottom-0 z-[90] max-h-[92dvh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#12121A] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            variants={reduce ? undefined : sheetVariants}
            initial={reduce ? false : "hidden"}
            animate="visible"
            exit="exit"
            transition={sheetSpring}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />

            {/* Header */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-xl border border-[#FF7A3D]/35 bg-[#FF7A3D]/15 flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4 text-[#FF7A3D]" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight">
                    {t("alerts_sheet_title")}
                  </h2>
                  <p className="text-[10px] font-mono text-[#6B6B78]">
                    {t("al_hub_sub", {
                      n: enabledCount,
                      t: ALERT_CATALOG.length,
                    })}
                  </p>
                </div>
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

            {/* Master */}
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 mb-4">
              <div className="min-w-0 pr-2">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {t("watchdog")}
                  {on && badCount > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-[#EF4444]">
                      <AlertTriangle className="w-3 h-3" />
                      {badCount}
                    </span>
                  ) : on ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                  ) : (
                    <BellOff className="w-3.5 h-3.5 text-[#6B6B78]" />
                  )}
                </div>
                <div className="text-[11px] text-[#A0A0B0] mt-0.5">
                  {on ? t("armed") : t("off")}
                  {hasChat === false ? t("need_start") : ""}
                  {sub?.lastTickAt
                    ? ` · ${new Date(sub.lastTickAt).toLocaleTimeString()}`
                    : ""}
                </div>
              </div>
              <Toggle
                on={on}
                disabled={busy || !bridgeToken}
                onChange={(v) =>
                  void saveSubscribe({ enabled: v, sendTest: v })
                }
              />
            </div>

            {!bridgeToken ? (
              <div className="rounded-2xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3.5 py-3 mb-4">
                <p className="text-[12px] text-[#F59E0B] leading-relaxed">
                  {t("hint_save_token")}
                </p>
              </div>
            ) : null}

            {/* Groups + catalog */}
            {groups.map((g) => {
              const items = ALERT_CATALOG.filter((c) => c.group === g.id);
              return (
                <div key={g.id} className="mb-4">
                  <div className="flex items-center gap-2 mb-2 px-0.5">
                    <span
                      className="h-1 w-1 rounded-full"
                      style={{ background: g.color }}
                    />
                    <span
                      className="text-[10px] font-mono tracking-[0.16em] uppercase"
                      style={{ color: g.color }}
                    >
                      {g.title}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/25 overflow-hidden divide-y divide-white/[0.05]">
                    {items.map((item) => {
                      const Icon = ICONS[item.id];
                      const enabled = !muted.includes(item.id);
                      const liveKey =
                        item.id === "bridge.offline"
                          ? "bridge.offline"
                          : item.id;
                      const live = state[liveKey]?.status;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-3 py-3"
                        >
                          <div
                            className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0"
                            style={{
                              borderColor: `${g.color}33`,
                              background: `${g.color}12`,
                              color: g.color,
                            }}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[13px] font-medium text-[#E8E8F0] truncate">
                                {t(TITLE_KEY[item.id])}
                              </span>
                              {item.severity === "critical" ? (
                                <span className="text-[8px] font-mono text-[#EF4444] tracking-wider">
                                  ! 
                                </span>
                              ) : null}
                              {live === "bad" ? (
                                <span className="text-[8px] font-mono text-[#EF4444]">
                                  ALERT
                                </span>
                              ) : live === "ok" ? (
                                <span className="text-[8px] font-mono text-[#10B981]">
                                  OK
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[10px] text-[#6B6B78] leading-snug mt-0.5">
                              {t(BODY_KEY[item.id])}
                            </p>
                          </div>
                          <Toggle
                            on={enabled}
                            disabled={busy || !bridgeToken}
                            onChange={(v) => setMutedId(item.id, v)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Thresholds */}
            <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3 mb-4 space-y-3">
              <div className="text-[10px] font-mono tracking-[0.14em] text-[#6B6B78]">
                {t("al_thresholds")}
              </div>
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
                    className="h-8 w-8 rounded-lg border border-white/10 font-mono"
                    onClick={() => {
                      setMinPeers((n) => Math.max(0, n - 1));
                      setDirty(true);
                    }}
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-mono text-sm tabular-nums">
                    {minPeers}
                  </span>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-lg border border-white/10 font-mono"
                    onClick={() => {
                      setMinPeers((n) => Math.min(30, n + 1));
                      setDirty(true);
                    }}
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
                    className="h-8 w-8 rounded-lg border border-white/10 font-mono"
                    onClick={() => {
                      setPostLag((n) => Math.max(6, n - 6));
                      setDirty(true);
                    }}
                  >
                    −
                  </button>
                  <span className="w-10 text-center font-mono text-sm tabular-nums">
                    {postLag}
                  </span>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-lg border border-white/10 font-mono"
                    onClick={() => {
                      setPostLag((n) => Math.min(120, n + 6));
                      setDirty(true);
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {hint ? (
              <p className="text-[11px] font-mono text-[#A0A0B0] mb-3 leading-relaxed">
                {hint}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                disabled={busy || !bridgeToken || (!dirty && on)}
                onClick={() =>
                  void saveSubscribe({ enabled: true, sendTest: false })
                }
                className="h-11 rounded-xl border border-[#FF7A3D]/40 bg-[#FF7A3D]/15 text-[#FF7A3D] font-mono text-[11px] tracking-wider font-semibold disabled:opacity-40"
              >
                {t("al_save_prefs")}
              </button>
              <button
                type="button"
                disabled={busy || !bridgeToken}
                onClick={() => void sendTest()}
                className="h-11 rounded-xl border border-white/15 bg-white/[0.06] font-mono text-[11px] tracking-wider disabled:opacity-40"
              >
                {t("send_test")}
              </button>
            </div>
            <p className="text-[9px] text-center text-[#5C5C6A] font-mono pb-1">
              {t("al_edge_note")}
            </p>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
