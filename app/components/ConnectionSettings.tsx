"use client";

import { useState, useEffect, useRef, useCallback, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Settings,
  X,
  RefreshCw,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  Cable,
  Server,
  Wifi,
  WifiOff,
  Loader2,
  Sparkles,
  Download,
  Terminal,
  Radio,
  Container,
  ChevronDown,
  ChevronUp,
  Bell,
  BellOff,
} from "lucide-react";
import { toast } from "sonner";
import { isTelegramMiniApp } from "../lib/telegram";
import type {
  NodeMode,
  BridgeStatus,
  OracleViewMode,
} from "../lib/node-api";
import {
  bridgeDockerCommand,
  bridgeDockerOracleCommand,
  bridgeInstallCommand,
  bridgeRunCommand,
  createBridgeToken,
  saveBridgeToken,
  saveNodeMode,
  saveOracleViewMode,
} from "../lib/node-api";
import { copyTextToClipboard } from "../lib/copy-text";

/** Same modal chrome: node dashboard or oracle page (one product, one bridge). */
export type ConnectionSettingsVariant = "node" | "oracle";

interface ConnectionSettingsProps {
  isOnline: boolean;
  onReconnect: () => void;
  onOpenChange?: (open: boolean) => void;
  /** Node page: lumen | my. Oracle page: mapped network→lumen, my→my */
  nodeMode: NodeMode;
  setNodeMode: (mode: NodeMode) => void;
  bridgeToken: string;
  setBridgeToken: (token: string) => void;
  bridgeStatus: BridgeStatus | null;
  bridgeStatusLoading?: boolean;
  onRefreshBridgeStatus?: () => void;
  /** Hide default trigger (e.g. mobile uses a shared menu) */
  hideTrigger?: boolean;
  /** Bump to open modal from parent menu */
  openKey?: number;
  /**
   * node = dashboard NODE SETTINGS (default)
   * oracle = same UI for /oracles (NETWORK / MY ORACLE + optional pool metrics)
   */
  variant?: ConnectionSettingsVariant;
}

function CopyButton({
  value,
  label = "Copy",
  primary = false,
}: {
  value: string;
  label?: string;
  primary?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const onCopy = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!value || busy) return;

    setBusy(true);
    const ok = await copyTextToClipboard(value);
    setBusy(false);

    if (ok) {
      setCopied(true);
      toast.success("Copied", {
        description: `${label} — paste into your terminal`,
        duration: 2200,
      });
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Could not copy", {
        description: "Select the command text and copy manually (Ctrl/Cmd+C)",
      });
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={!value || busy}
      className={
        primary
          ? `flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-mono tracking-widest disabled:opacity-40 lumen-ui-transition ${
              copied
                ? "border-[#10B981]/50 bg-[#10B981]/15 text-[#10B981]"
                : "border-[#00E5FF]/40 bg-[#00E5FF]/15 text-[#00E5FF] hover:bg-[#00E5FF]/25"
            }`
          : `flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-mono tracking-widest disabled:opacity-40 lumen-ui-transition ${
              copied
                ? "border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981]"
                : "border-white/15 hover:bg-white/5 text-[#A0A0B0] hover:text-white"
            }`
      }
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied!" : `Copy ${label}`}
    >
      {copied ? (
        <Check size={12} className="text-[#10B981]" />
      ) : (
        <Copy size={12} />
      )}
      {copied ? "COPIED" : busy ? "…" : "COPY"}
    </button>
  );
}

function StepCard({
  n,
  title,
  subtitle,
  done,
  active,
  children,
}: {
  n: number;
  title: string;
  subtitle?: string;
  done?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 lumen-ui-transition ${
        done
          ? "border-[#10B981]/30 bg-[#10B981]/5"
          : active
            ? "border-[#00E5FF]/30 bg-[#00E5FF]/5"
            : "border-white/10 bg-black/30"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-semibold ${
            done
              ? "bg-[#10B981] text-black"
              : active
                ? "bg-[#00E5FF] text-black"
                : "bg-white/10 text-[#A0A0B0]"
          }`}
        >
          {done ? <Check size={14} strokeWidth={3} /> : n}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-mono tracking-widest text-[#E8E8F0]">
            {title}
          </div>
          {subtitle && (
            <div className="text-[11px] text-[#A0A0B0] mt-0.5 leading-snug">
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function CommandBlock({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono tracking-widest text-[#A0A0B0]">
          {label}
        </span>
        <CopyButton value={value} label={label} primary />
      </div>
      <pre className="w-full bg-[#0A0A0F] border border-white/15 rounded-xl px-3.5 py-3 font-mono text-[10px] sm:text-[11px] text-[#00E5FF] whitespace-pre-wrap break-all leading-relaxed select-all">
        {value || "…"}
      </pre>
    </div>
  );
}

export default function ConnectionSettings({
  isOnline,
  onReconnect,
  onOpenChange,
  nodeMode,
  setNodeMode,
  bridgeToken,
  setBridgeToken,
  bridgeStatus,
  bridgeStatusLoading = false,
  onRefreshBridgeStatus,
  hideTrigger = false,
  openKey = 0,
  variant = "node",
}: ConnectionSettingsProps) {
  const isOracle = variant === "oracle";
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const lastOpenKey = useRef(0);

  const setModalOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const [mounted, setMounted] = useState(false);
  const [creatingToken, setCreatingToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  /** Oracle agent: attach only pools you run (one or both) */
  const [oracleUsd, setOracleUsd] = useState(true);
  const [oracleXau, setOracleXau] = useState(false);

  /** TA-1 Telegram private alerts */
  const [tgAlertsOn, setTgAlertsOn] = useState(false);
  const [tgAlertsBusy, setTgAlertsBusy] = useState(false);
  const [tgAlertsHint, setTgAlertsHint] = useState<string | null>(null);
  const [tgHasChat, setTgHasChat] = useState<boolean | null>(null);
  const [inTg, setInTg] = useState(false);

  const bridgeOnline = !!bridgeStatus?.connected;
  const bridgeKnown = bridgeStatus?.known !== false;
  const agentOracles = bridgeStatus?.oracles || [];

  // Docker context + install.sh come from GitHub (from-ufa/lumen)
  const dockerCmd = bridgeToken
    ? isOracle
      ? bridgeDockerOracleCommand(bridgeToken, {
          usd: oracleUsd,
          xau: oracleXau,
        })
      : bridgeDockerCommand(bridgeToken)
    : "";
  const installCmd = bridgeInstallCommand();
  const runCmd = bridgeToken
    ? bridgeRunCommand(
        bridgeToken,
        undefined,
        isOracle ? { oracleUsd, oracleXau } : undefined
      )
    : "";

  useEffect(() => {
    setMounted(true);
    setInTg(isTelegramMiniApp());
  }, []);

  const refreshTgAlerts = useCallback(async () => {
    if (!bridgeToken) {
      setTgAlertsOn(false);
      setTgHasChat(null);
      setTgAlertsHint(null);
      return;
    }
    try {
      const res = await fetch("/api/tg/alerts/me", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        hasChat?: boolean;
        subscriptions?: Array<{
          prefs?: { enabled?: boolean };
          tokenFp?: string;
        }>;
        error?: string;
        disabled?: boolean;
      };
      if (data.disabled) {
        setTgAlertsHint("Bot not configured on server");
        return;
      }
      if (!res.ok) {
        setTgHasChat(false);
        setTgAlertsOn(false);
        if (data.error === "auth_required") {
          setTgAlertsHint(
            inTg
              ? "Open Mini App from the bot so we can verify you"
              : "Available inside Telegram Mini App"
          );
        }
        return;
      }
      setTgHasChat(!!data.hasChat);
      const enabled = (data.subscriptions || []).some(
        (s) => s.prefs?.enabled
      );
      setTgAlertsOn(enabled);
      if (!data.hasChat) {
        setTgAlertsHint("Send /start to @ergolumen_bot first");
      } else if (enabled) {
        setTgAlertsHint("Watchdog armed · bridge offline / oracle down / lag");
      } else {
        setTgAlertsHint("Opt-in to get private problem alerts");
      }
    } catch {
      setTgAlertsHint("Could not load alert status");
    }
  }, [bridgeToken, inTg]);

  useEffect(() => {
    if (!open || !bridgeToken) return;
    void refreshTgAlerts();
  }, [open, bridgeToken, refreshTgAlerts]);

  const toggleTgAlerts = async (next: boolean) => {
    if (!bridgeToken || tgAlertsBusy) return;
    setTgAlertsBusy(true);
    try {
      if (next) {
        const res = await fetch("/api/tg/alerts/subscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bridgeToken,
            scopes: { node: !isOracle ? true : true, oracle: true },
            prefs: { enabled: true },
            sendTest: true,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          hint?: string;
          testSent?: boolean;
        };
        if (!res.ok || !data.ok) {
          toast.error(
            data.hint ||
              data.error ||
              "Could not enable alerts"
          );
          if (data.error === "chat_required") {
            setTgAlertsHint("Send /start to @ergolumen_bot, then retry");
          }
          return;
        }
        setTgAlertsOn(true);
        setTgHasChat(true);
        setTgAlertsHint(
          data.testSent
            ? "Enabled · test message sent to Telegram"
            : data.hint || "Alerts enabled"
        );
        toast.success("Telegram alerts on");
      } else {
        const res = await fetch("/api/tg/alerts/unsubscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mute: true }),
        });
        if (!res.ok) {
          toast.error("Could not mute alerts");
          return;
        }
        setTgAlertsOn(false);
        setTgAlertsHint("Muted · /alerts on in bot to re-enable");
        toast.message("Telegram alerts muted");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setTgAlertsBusy(false);
      void refreshTgAlerts();
    }
  };

  useEffect(() => {
    if (!openKey || openKey === lastOpenKey.current) return;
    lastOpenKey.current = openKey;
    setModalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  useEffect(() => {
    if (open) {
      onRefreshBridgeStatus?.();
    }
  }, [open, onRefreshBridgeStatus]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleMode = (mode: NodeMode) => {
    if (mode === nodeMode) return;
    if (mode === "my" && !bridgeToken) {
      void ensureToken();
    }
    setNodeMode(mode);
    if (isOracle) {
      const ov: OracleViewMode = mode === "my" ? "my" : "network";
      saveOracleViewMode(ov);
      if (mode === "my") {
        toast.success("My Oracle mode", {
          description: bridgeOnline
            ? "Reading your oracle agent via lumen bridge"
            : "Run the Docker command below to connect Bridge",
        });
      } else {
        toast.success("Network mode", {
          description: "Public on-chain oracle pools",
        });
      }
    } else {
      saveNodeMode(mode);
      if (mode === "my") {
        toast.success("My Node mode", {
          description: bridgeOnline
            ? "Dashboard reads your node via lumen bridge"
            : "Run the Docker command below to connect Bridge",
        });
      } else {
        toast.success("lumen node mode", {
          description: "Using this server’s Ergo node",
        });
      }
    }
    setTimeout(onReconnect, 80);
  };

  const ensureToken = async (): Promise<string | null> => {
    if (bridgeToken) return bridgeToken;
    setCreatingToken(true);
    try {
      const data = await createBridgeToken("dashboard");
      setBridgeToken(data.token);
      saveBridgeToken(data.token);
      setShowToken(false);
      onRefreshBridgeStatus?.();
      return data.token;
    } catch (err) {
      toast.error("Could not create token", {
        description: err instanceof Error ? err.message : "bridge server error",
      });
      return null;
    } finally {
      setCreatingToken(false);
    }
  };

  const switchToMy = () => {
    setNodeMode("my");
    if (isOracle) saveOracleViewMode("my");
    else saveNodeMode("my");
  };

  const handleStartConnect = async () => {
    const t = await ensureToken();
    if (t) {
      toast.success("Your personal token is ready", {
        description: isOracle
          ? "Copy the Docker command and paste it next to oracle-core (and/or Ergo)."
          : "Copy the Docker command and paste it next to your node.",
      });
      if (nodeMode !== "my") switchToMy();
    }
  };

  const handleCreateToken = async () => {
    setCreatingToken(true);
    try {
      const data = await createBridgeToken(isOracle ? "oracle" : "dashboard");
      setBridgeToken(data.token);
      saveBridgeToken(data.token);
      setShowToken(true);
      toast.success("New token created", {
        description: "Copy the Docker command again — the old token stops working.",
      });
      onRefreshBridgeStatus?.();
      if (nodeMode !== "my") switchToMy();
    } catch (err) {
      toast.error("Could not create token", {
        description: err instanceof Error ? err.message : "bridge server error",
      });
    } finally {
      setCreatingToken(false);
    }
  };

  const handleClearToken = () => {
    setBridgeToken("");
    saveBridgeToken("");
    setShowToken(false);
    if (nodeMode === "my") {
      setNodeMode("lumen");
      if (isOracle) saveOracleViewMode("network");
      else saveNodeMode("lumen");
    }
    toast.message("Bridge token cleared");
  };

  const statusLine = () => {
    if (nodeMode === "my") {
      if (isOracle) {
        if (bridgeOnline && isOnline)
          return { text: "● MY ORACLE · LIVE", ok: true as const };
        if (bridgeOnline && !isOnline)
          return { text: "● BRIDGE UP · FEEDS SLOW", ok: false as const };
        if (!bridgeToken)
          return { text: "● MY ORACLE · NO TOKEN", ok: false as const };
      } else {
        if (bridgeOnline && isOnline)
          return { text: "● MY NODE · LIVE", ok: true as const };
        if (bridgeOnline && !isOnline)
          return { text: "● BRIDGE UP · NODE SLOW", ok: false as const };
        if (!bridgeToken)
          return { text: "● MY NODE · NO TOKEN", ok: false as const };
      }
      if (bridgeStatus?.error === "bridge_server_unreachable")
        return { text: "● BRIDGE SERVER DOWN", ok: false as const };
      if (bridgeStatus && !bridgeKnown)
        return { text: "● TOKEN UNKNOWN · REISSUE", ok: false as const };
      return { text: "● WAITING FOR BRIDGE…", ok: false as const };
    }
    if (isOracle) {
      return {
        text: isOnline ? "● NETWORK · ONLINE" : "● NETWORK · OFFLINE",
        ok: isOnline,
      };
    }
    return {
      text: isOnline ? "● lumen node · ONLINE" : "● lumen node · OFFLINE",
      ok: isOnline,
    };
  };
  const status = statusLine();
  const dockerDone = bridgeOnline;

  const modal =
    open &&
    mounted &&
    createPortal(
      <AnimatePresence>
        {open && (
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={
              isOracle ? "Oracle connection settings" : "Node connection settings"
            }
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.1 : 0.18 }}
              className="absolute inset-0 bg-black/80"
              onClick={() => setModalOpen(false)}
            />

            <motion.div
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.96, y: 12 }
              }
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.98, y: 8 }
              }
              transition={{
                duration: reduceMotion ? 0.12 : 0.22,
                ease: [0.23, 1, 0.32, 1],
              }}
              className="glass relative z-10 w-full max-w-lg max-h-[min(92dvh,900px)] overflow-y-auto no-scrollbar rounded-t-3xl sm:rounded-3xl p-5 sm:p-8 border border-white/10 shadow-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-6 sm:mb-7">
                <div>
                  <div className="font-mono text-xs tracking-[4px] text-[#FF7A3D]">
                    SETTINGS
                  </div>
                  <div className="text-2xl sm:text-3xl font-semibold tracking-tighter mt-1">
                    {isOracle
                      ? nodeMode === "my"
                        ? "My Oracle"
                        : "Network"
                      : nodeMode === "my"
                        ? "My Node"
                        : "lumen node"}
                  </div>
                  <div
                    className={`mt-2 text-[10px] font-mono tracking-widest ${
                      status.ok ? "text-[#10B981]" : "text-[#EF4444]"
                    }`}
                  >
                    {status.text}
                  </div>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="text-[#A0A0B0] hover:text-white p-2 -mr-1 rounded-xl hover:bg-white/5"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-5">
                {/* === DATA SOURCE === */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-[#FF7A3D]" />
                    <span className="text-xs font-mono tracking-widest text-[#E8E8F0]">
                      DATA SOURCE
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-black/40 border border-white/10">
                    <button
                      type="button"
                      onClick={() => handleMode("lumen")}
                      className={`flex flex-col items-start gap-1 px-3 py-3 rounded-xl text-left lumen-ui-transition ${
                        nodeMode === "lumen"
                          ? "bg-[#FF7A3D]/15 border border-[#FF7A3D]/40 text-[#FF7A3D]"
                          : "text-[#A0A0B0] hover:text-white border border-transparent"
                      }`}
                    >
                      <span className="text-[11px] font-mono tracking-widest flex items-center gap-1.5">
                        <Sparkles size={13} />{" "}
                        {isOracle ? "NETWORK" : "lumen node"}
                      </span>
                      <span className="text-[10px] text-[#A0A0B0]/80 leading-snug font-normal">
                        {isOracle
                          ? "Public on-chain pools"
                          : "This server’s Ergo node"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMode("my")}
                      className={`flex flex-col items-start gap-1 px-3 py-3 rounded-xl text-left lumen-ui-transition ${
                        nodeMode === "my"
                          ? "bg-[#00E5FF]/12 border border-[#00E5FF]/40 text-[#00E5FF]"
                          : "text-[#A0A0B0] hover:text-white border border-transparent"
                      }`}
                    >
                      <span className="text-[11px] font-mono tracking-widest flex items-center gap-1.5">
                        <Cable size={13} />{" "}
                        {isOracle ? "MY ORACLE" : "MY NODE"}
                      </span>
                      <span className="text-[10px] text-[#A0A0B0]/80 leading-snug font-normal">
                        Via lumen bridge
                      </span>
                    </button>
                  </div>
                </div>

                {/* === CONNECT (same agent for node + oracle) === */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Cable className="w-4 h-4 text-[#00E5FF]" />
                      <span className="text-xs font-mono tracking-widest text-[#E8E8F0]">
                        {isOracle ? "CONNECT MY ORACLE" : "CONNECT MY NODE"}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] font-mono tracking-widest px-2.5 py-1 rounded-full border ${
                        bridgeOnline
                          ? "border-[#10B981]/40 text-[#10B981] bg-[#10B981]/10"
                          : "border-[#F59E0B]/35 text-[#F59E0B] bg-[#F59E0B]/10"
                      }`}
                    >
                      {bridgeStatusLoading ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : bridgeOnline ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] status-dot" />
                      ) : (
                        <WifiOff size={10} />
                      )}
                      {bridgeOnline ? "BRIDGE ONLINE" : "BRIDGE OFFLINE"}
                    </span>
                  </div>

                  <p className="text-[11px] text-[#A0A0B0] leading-relaxed">
                    {isOracle ? (
                      <>
                        Same{" "}
                        <span className="text-[#E8E8F0]">lumen bridge</span> as
                        My Node — one token, optional oracle metrics. No open
                        ports.{" "}
                        <span className="text-[#00E5FF]">Docker</span>: one
                        command, copy → paste → done.
                      </>
                    ) : (
                      <>
                        Connect <span className="text-[#E8E8F0]">your</span>{" "}
                        Ergo node — no open ports.{" "}
                        <span className="text-[#00E5FF]">Docker</span>: one
                        command, copy → paste → done.
                      </>
                    )}
                  </p>

                  {!bridgeToken ? (
                    <button
                      type="button"
                      onClick={handleStartConnect}
                      disabled={creatingToken}
                      className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF] text-xs font-mono tracking-widest hover:bg-[#00E5FF]/15 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.985] lumen-ui-transition"
                    >
                      {creatingToken ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Container size={15} />
                      )}
                      {creatingToken
                        ? "PREPARING…"
                        : "START — GET DOCKER COMMAND"}
                    </button>
                  ) : (
                    <div className="space-y-3">
                      {isOracle && (
                        <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
                          <div className="text-[10px] font-mono tracking-widest text-[#A0A0B0]">
                            ORACLE POOLS ON THIS MACHINE
                          </div>
                          <p className="text-[10px] text-[#A0A0B0]/75 leading-relaxed">
                            Enable only what you run — one pool is fine.
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setOracleUsd((v) => !v)}
                              className={`px-3 py-2.5 rounded-xl border text-left text-[11px] font-mono tracking-wider lumen-ui-transition ${
                                oracleUsd
                                  ? "border-[#2DD4BF]/40 bg-[#2DD4BF]/10 text-[#2DD4BF]"
                                  : "border-white/10 text-[#6B6B78]"
                              }`}
                            >
                              ERG/USD
                              <div className="text-[9px] mt-0.5 opacity-70">
                                :9021
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setOracleXau((v) => !v)}
                              className={`px-3 py-2.5 rounded-xl border text-left text-[11px] font-mono tracking-wider lumen-ui-transition ${
                                oracleXau
                                  ? "border-[#C9A84C]/40 bg-[#C9A84C]/10 text-[#C9A84C]"
                                  : "border-white/10 text-[#6B6B78]"
                              }`}
                            >
                              ERG/XAU
                              <div className="text-[9px] mt-0.5 opacity-70">
                                :9011
                              </div>
                            </button>
                          </div>
                          {!oracleUsd && !oracleXau && (
                            <p className="text-[10px] text-[#F59E0B]">
                              Select at least one pool for the Docker command.
                            </p>
                          )}
                        </div>
                      )}

                      <StepCard
                        n={1}
                        title="RUN WITH DOCKER"
                        subtitle={
                          isOracle
                            ? "Paste on the machine with oracle-core (and Ergo if you use My Node)."
                            : "Paste on the machine with your Ergo node (Docker + Linux host network)."
                        }
                        done={dockerDone}
                        active={!bridgeOnline}
                      >
                        <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-[#A0A0B0] mb-1">
                          <Container size={12} className="text-[#00E5FF]" />
                          RECOMMENDED · ONE COMMAND
                        </div>
                        <CommandBlock
                          value={dockerCmd}
                          label="DOCKER · COPY & RUN"
                        />
                        <p className="text-[10px] text-[#A0A0B0]/65 leading-relaxed">
                          Builds from{" "}
                          <span className="font-mono text-[#A0A0B0]">
                            github.com/from-ufa/lumen
                          </span>
                          , starts{" "}
                          <span className="font-mono text-[#A0A0B0]">
                            lumen-bridge
                          </span>{" "}
                          with your token. Auto-restart after reboot.
                          {isOracle ? (
                            <>
                              {" "}
                              Metrics only from{" "}
                              <span className="font-mono">127.0.0.1</span> —
                              never exposed.
                            </>
                          ) : (
                            <>
                              {" "}
                              Needs Ergo REST on{" "}
                              <span className="font-mono">127.0.0.1:9053</span>.
                            </>
                          )}
                        </p>
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-[10px] text-[#A0A0B0]/70 font-mono tracking-wider">
                            YOUR TOKEN
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setShowToken((v) => !v)}
                              className="p-1.5 text-[#A0A0B0] hover:text-white"
                              aria-label={
                                showToken ? "Hide token" : "Show token"
                              }
                            >
                              {showToken ? (
                                <EyeOff size={14} />
                              ) : (
                                <Eye size={14} />
                              )}
                            </button>
                            <CopyButton value={bridgeToken} label="Token" />
                          </div>
                        </div>
                        <div className="font-mono text-[10px] break-all text-[#A0A0B0]/80 bg-black/40 rounded-xl px-3 py-2">
                          {showToken
                            ? bridgeToken
                            : `${bridgeToken.slice(0, 12)}${"•".repeat(16)}${bridgeToken.slice(-4)}`}
                        </div>
                        {bridgeStatus && !bridgeKnown && (
                          <p className="text-[10px] text-[#F59E0B]">
                            Token not registered on the hub. Tap{" "}
                            <span className="font-mono">New token</span>, then
                            re-run the Docker command.
                          </p>
                        )}
                        {bridgeToken && !bridgeOnline && bridgeKnown && (
                          <p className="text-[10px] text-[#A0A0B0]/80 leading-relaxed">
                            Hub knows this token but no agent is online. On the
                            node host re-run Docker (
                            <span className="font-mono text-[#A0A0B0]">
                              LUMEN_SERVER=wss://ergolumen.net/ws/bridge
                            </span>
                            ) and check{" "}
                            <span className="font-mono">
                              docker logs -f lumen-bridge
                            </span>
                            .
                          </p>
                        )}
                      </StepCard>

                      <StepCard
                        n={2}
                        title="WAIT FOR ONLINE"
                        subtitle={
                          bridgeOnline
                            ? isOracle
                              ? "Connected. Use My Oracle — your agent metrics are live."
                              : "Connected. Use My Node mode — data is live."
                            : "After Docker starts, this flips to Online automatically."
                        }
                        done={bridgeOnline}
                        active={!!bridgeToken && !bridgeOnline}
                      >
                        <div
                          className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
                            bridgeOnline
                              ? "border-[#10B981]/40 bg-[#10B981]/10"
                              : "border-[#F59E0B]/30 bg-[#F59E0B]/10"
                          }`}
                        >
                          {bridgeOnline ? (
                            <Wifi className="w-5 h-5 text-[#10B981] flex-shrink-0" />
                          ) : bridgeStatusLoading ? (
                            <Loader2 className="w-5 h-5 text-[#F59E0B] animate-spin flex-shrink-0" />
                          ) : (
                            <Radio className="w-5 h-5 text-[#F59E0B] flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div
                              className={`text-sm font-mono tracking-widest ${
                                bridgeOnline
                                  ? "text-[#10B981]"
                                  : "text-[#F59E0B]"
                              }`}
                            >
                              {bridgeOnline
                                ? "ONLINE — BRIDGE CONNECTED"
                                : "OFFLINE — WAITING FOR BRIDGE"}
                            </div>
                            <div className="text-[10px] text-[#A0A0B0] mt-0.5 truncate">
                              {bridgeOnline
                                ? [
                                    bridgeStatus?.node,
                                    agentOracles.length
                                      ? `oracles ${agentOracles.join("+")}`
                                      : null,
                                    bridgeStatus?.remoteAddress,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "Agent linked"
                                : "docker logs -f lumen-bridge  ·  keep container running"}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            type="button"
                            onClick={() => onRefreshBridgeStatus?.()}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/15 hover:bg-white/5 text-[11px] font-mono tracking-widest"
                          >
                            <RefreshCw
                              size={13}
                              className={
                                bridgeStatusLoading ? "animate-spin" : ""
                              }
                            />
                            REFRESH STATUS
                          </button>
                          {bridgeOnline && nodeMode !== "my" && (
                            <button
                              type="button"
                              onClick={() => handleMode("my")}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF] text-[11px] font-mono tracking-widest hover:bg-[#00E5FF]/15"
                            >
                              {isOracle ? "USE MY ORACLE NOW" : "USE MY NODE NOW"}
                            </button>
                          )}
                        </div>
                      </StepCard>

                      <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowAdvanced((v) => !v)}
                          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-[11px] font-mono tracking-widest text-[#A0A0B0] hover:text-white hover:bg-white/[0.03]"
                        >
                          <span className="flex items-center gap-2">
                            <Terminal size={13} />
                            ADVANCED · WITHOUT DOCKER
                          </span>
                          {showAdvanced ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </button>
                        {showAdvanced && (
                          <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                            <p className="text-[10px] text-[#A0A0B0] leading-relaxed">
                              Node.js 18+ on the machine with your Ergo node.
                              Two commands instead of one Docker paste.
                            </p>
                            <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-[#A0A0B0]">
                              <Download size={12} />
                              1 · INSTALL
                            </div>
                            <CommandBlock
                              value={installCmd}
                              label="INSTALL · COPY"
                            />
                            <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-[#A0A0B0]">
                              <Terminal size={12} />
                              2 · RUN
                            </div>
                            <CommandBlock
                              value={runCmd}
                              label="RUN · COPY"
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleCreateToken}
                          disabled={creatingToken}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-[10px] font-mono tracking-widest text-[#A0A0B0] hover:text-white hover:bg-white/5 disabled:opacity-40"
                        >
                          {creatingToken ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <KeyRound size={12} />
                          )}
                          NEW TOKEN
                        </button>
                        <button
                          type="button"
                          onClick={handleClearToken}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-[10px] font-mono tracking-widest text-[#A0A0B0] hover:text-white hover:bg-white/5"
                        >
                          CLEAR
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* === TELEGRAM ALERTS (TA-1) === */}
                {bridgeToken && (
                  <div className="rounded-2xl border border-[#FF7A3D]/25 bg-gradient-to-br from-[#FF7A3D]/[0.08] to-transparent p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {tgAlertsOn ? (
                          <Bell className="w-4 h-4 text-[#FF7A3D] shrink-0" />
                        ) : (
                          <BellOff className="w-4 h-4 text-[#A0A0B0] shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-mono tracking-widest text-[#E8E8F0]">
                            TELEGRAM ALERTS
                          </div>
                          <div className="text-[10px] text-[#A0A0B0] mt-0.5 leading-snug">
                            Private push when bridge / oracle has problems
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={tgAlertsBusy || !bridgeToken}
                        onClick={() => void toggleTgAlerts(!tgAlertsOn)}
                        className={`shrink-0 relative h-8 w-14 rounded-full border lumen-ui-transition ${
                          tgAlertsOn
                            ? "bg-[#FF7A3D]/25 border-[#FF7A3D]/50"
                            : "bg-white/[0.04] border-white/15"
                        } disabled:opacity-40`}
                        aria-pressed={tgAlertsOn}
                        aria-label={
                          tgAlertsOn
                            ? "Disable Telegram alerts"
                            : "Enable Telegram alerts"
                        }
                      >
                        {tgAlertsBusy ? (
                          <Loader2
                            size={14}
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-[#E8E8F0]"
                          />
                        ) : (
                          <span
                            className={`absolute top-0.5 h-6 w-6 rounded-full shadow transition-transform ${
                              tgAlertsOn
                                ? "left-7 bg-[#FF7A3D]"
                                : "left-0.5 bg-[#6B6B78]"
                            }`}
                          />
                        )}
                      </button>
                    </div>
                    {tgAlertsHint && (
                      <p className="text-[10px] font-mono text-[#A0A0B0] leading-relaxed">
                        {tgAlertsHint}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={tgAlertsBusy}
                        onClick={async () => {
                          setTgAlertsBusy(true);
                          try {
                            const res = await fetch("/api/tg/alerts/test", {
                              method: "POST",
                              credentials: "include",
                            });
                            const data = (await res.json().catch(() => ({}))) as {
                              ok?: boolean;
                              hint?: string;
                              error?: string;
                            };
                            if (res.ok && data.ok) {
                              toast.success("Test sent to Telegram");
                            } else {
                              toast.error(
                                data.hint || data.error || "Test failed"
                              );
                            }
                          } catch {
                            toast.error("Test failed");
                          } finally {
                            setTgAlertsBusy(false);
                          }
                        }}
                        className="px-3 py-2 rounded-xl border border-white/10 text-[10px] font-mono tracking-widest text-[#A0A0B0] hover:text-white hover:bg-white/5 disabled:opacity-40"
                      >
                        TEST ALERT
                      </button>
                      {tgHasChat === false && (
                        <span className="text-[10px] font-mono text-[#D4A574] self-center">
                          /start in bot first
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <button
                    onClick={() => setModalOpen(false)}
                    className="flex-1 py-4 rounded-2xl bg-[#FF7A3D] text-black font-semibold tracking-wider text-sm active:scale-[0.985] lumen-ui-transition"
                  >
                    DONE
                  </button>
                  <button
                    onClick={onReconnect}
                    className="flex items-center justify-center gap-2 px-6 py-4 rounded-2xl border border-white/20 hover:bg-white/5 text-sm font-mono tracking-widest active:scale-[0.985]"
                  >
                    <RefreshCw size={15} /> RECONNECT
                  </button>
                </div>
              </div>

              <div className="mt-6 sm:mt-7 pt-5 border-t border-white/10 text-xs text-[#A0A0B0]/70 font-mono tracking-[0.5px]">
                Agent from GitHub · WSS{" "}
                <span className="text-[#A0A0B0]">
                  wss://ergolumen.net/ws/bridge
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    );

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="lumen-header-pill inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full border border-white/10 bg-white/[0.04] text-[#E8E8F0] text-[10px] font-mono font-medium tracking-[0.16em] uppercase hover:border-white/25 hover:bg-white/[0.07] lumen-ui-transition active:scale-[0.98] box-border"
        >
          <Settings className="w-3.5 h-3.5 shrink-0 opacity-90" />
          <span>SETTINGS</span>
          {bridgeOnline && (
            <span
              className="hidden sm:inline-flex w-1.5 h-1.5 rounded-full bg-[#10B981] status-dot"
              title="Bridge online"
            />
          )}
        </button>
      )}
      {modal}
    </>
  );
}
