"use client";

import { useState, useEffect, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  X,
  RefreshCw,
  Globe,
  Shield,
  Info,
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
} from "lucide-react";
import { toast } from "sonner";
import type { NodeMode, BridgeStatus } from "../lib/node-api";
import {
  bridgeDockerCommand,
  bridgeHttpBase,
  bridgeInstallCommand,
  bridgeRunCommand,
  createBridgeToken,
  saveBridgeToken,
  saveNodeMode,
} from "../lib/node-api";
import { copyTextToClipboard } from "../lib/copy-text";

interface ConnectionSettingsProps {
  nodeUrl: string;
  setNodeUrl: (url: string) => void;
  isOnline: boolean;
  onReconnect: () => void;
  publicMode?: boolean;
  onPublicModeChange?: (enabled: boolean) => void;
  onOpenChange?: (open: boolean) => void;
  nodeMode: NodeMode;
  setNodeMode: (mode: NodeMode) => void;
  bridgeToken: string;
  setBridgeToken: (token: string) => void;
  bridgeStatus: BridgeStatus | null;
  bridgeStatusLoading?: boolean;
  onRefreshBridgeStatus?: () => void;
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
    // Modal shell uses stopPropagation; keep this a direct user gesture for clipboard
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
          ? `flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-mono tracking-widest disabled:opacity-40 transition-all ${
              copied
                ? "border-[#10B981]/50 bg-[#10B981]/15 text-[#10B981]"
                : "border-[#00E5FF]/40 bg-[#00E5FF]/15 text-[#00E5FF] hover:bg-[#00E5FF]/25"
            }`
          : `flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-mono tracking-widest disabled:opacity-40 transition-all ${
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
      className={`rounded-2xl border p-4 space-y-3 transition-all ${
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
  nodeUrl,
  setNodeUrl,
  isOnline,
  onReconnect,
  publicMode = false,
  onPublicModeChange,
  onOpenChange,
  nodeMode,
  setNodeMode,
  bridgeToken,
  setBridgeToken,
  bridgeStatus,
  bridgeStatusLoading = false,
  onRefreshBridgeStatus,
}: ConnectionSettingsProps) {
  const [open, setOpen] = useState(false);

  const setModalOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const [tempUrl, setTempUrl] = useState(nodeUrl);
  const [mounted, setMounted] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [creatingToken, setCreatingToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [httpBase, setHttpBase] = useState("http://80.209.232.82:3000");

  const bridgeOnline = !!bridgeStatus?.connected;
  const bridgeKnown = bridgeStatus?.known !== false;

  const dockerCmd = bridgeToken
    ? bridgeDockerCommand(bridgeToken, { httpBase })
    : "";
  const installCmd = bridgeInstallCommand(httpBase);
  const runCmd = bridgeToken ? bridgeRunCommand(bridgeToken) : "";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setTempUrl(nodeUrl);
      setNewPassword("");
      setShowPassword(false);
      setHttpBase(bridgeHttpBase());
      onRefreshBridgeStatus?.();
    }
  }, [open, nodeUrl, onRefreshBridgeStatus]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleSave = () => {
    if (tempUrl !== nodeUrl) {
      setNodeUrl(tempUrl);
      localStorage.setItem("lumen-node-url", tempUrl);
      toast.success("Node URL updated", { description: "Reconnecting..." });
      setTimeout(onReconnect, 120);
    }
    setModalOpen(false);
  };

  const handleMode = (mode: NodeMode) => {
    if (mode === nodeMode) return;
    if (mode === "my" && !bridgeToken) {
      void ensureToken();
    }
    setNodeMode(mode);
    saveNodeMode(mode);
    if (mode === "my") {
      toast.success("My Node mode", {
        description: bridgeOnline
          ? "Dashboard reads your node via Lumen Bridge"
          : "Follow the 3 steps below to connect Bridge",
      });
    } else {
      toast.success("Lumen Node mode", {
        description: "Using this server’s Ergo node",
      });
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

  const handleStartConnect = async () => {
    const t = await ensureToken();
    if (t) {
      toast.success("Your personal token is ready", {
        description: "Copy step 1, then step 2 into a terminal next to your node.",
      });
      // Auto-select My Node so data path is ready when Bridge comes online
      if (nodeMode !== "my") {
        setNodeMode("my");
        saveNodeMode("my");
      }
    }
  };

  const handleCreateToken = async () => {
    setCreatingToken(true);
    try {
      const data = await createBridgeToken("dashboard");
      setBridgeToken(data.token);
      saveBridgeToken(data.token);
      setShowToken(true);
      toast.success("New token created", {
        description: "Copy the Step 2 command again — the old token stops working.",
      });
      onRefreshBridgeStatus?.();
      if (nodeMode !== "my") {
        setNodeMode("my");
        saveNodeMode("my");
      }
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
      saveNodeMode("lumen");
    }
    toast.message("Bridge token cleared");
  };

  const handleChangePassword = async () => {
    const pwd = newPassword.trim();
    if (pwd.length < 10) {
      toast.error("Password too short", {
        description: "Minimum 10 characters",
      });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/public-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error("Could not update password", {
          description: data.error || `HTTP ${res.status}`,
        });
        return;
      }
      toast.success("Password updated", {
        description:
          "Public Mode active. Remote sessions must re-authenticate with the new password.",
      });
      setNewPassword("");
      onPublicModeChange?.(true);
    } catch {
      toast.error("Could not update password", {
        description: "Network error",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const statusLine = () => {
    if (nodeMode === "my") {
      if (bridgeOnline && isOnline)
        return { text: "● MY NODE · LIVE", ok: true as const };
      if (bridgeOnline && !isOnline)
        return { text: "● BRIDGE UP · NODE SLOW", ok: false as const };
      if (!bridgeToken)
        return { text: "● MY NODE · NO TOKEN", ok: false as const };
      if (bridgeStatus?.error === "bridge_server_unreachable")
        return { text: "● BRIDGE SERVER DOWN", ok: false as const };
      if (bridgeStatus && !bridgeKnown)
        return { text: "● TOKEN UNKNOWN · REISSUE", ok: false as const };
      return { text: "● WAITING FOR BRIDGE…", ok: false as const };
    }
    return {
      text: isOnline ? "● LUMEN NODE · ONLINE" : "● LUMEN NODE · OFFLINE",
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
            aria-label="Node connection settings"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80"
              onClick={() => setModalOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ ease: [0.23, 1, 0.32, 1] }}
              className="glass relative z-10 w-full max-w-lg max-h-[min(92dvh,900px)] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 sm:p-8 border border-white/10 shadow-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-6 sm:mb-7">
                <div>
                  <div className="font-mono text-xs tracking-[4px] text-[#FF7A3D]">
                    CONNECTION
                  </div>
                  <div className="text-2xl sm:text-3xl font-semibold tracking-tighter mt-1">
                    Ergo Node
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
                {/* === NODE MODE SWITCHER === */}
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
                      className={`flex flex-col items-start gap-1 px-3 py-3 rounded-xl text-left transition-all ${
                        nodeMode === "lumen"
                          ? "bg-[#FF7A3D]/15 border border-[#FF7A3D]/40 text-[#FF7A3D]"
                          : "text-[#A0A0B0] hover:text-white border border-transparent"
                      }`}
                    >
                      <span className="text-[11px] font-mono tracking-widest flex items-center gap-1.5">
                        <Sparkles size={13} /> LUMEN NODE
                      </span>
                      <span className="text-[10px] text-[#A0A0B0]/80 leading-snug font-normal">
                        This server’s Ergo node
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMode("my")}
                      className={`flex flex-col items-start gap-1 px-3 py-3 rounded-xl text-left transition-all ${
                        nodeMode === "my"
                          ? "bg-[#00E5FF]/12 border border-[#00E5FF]/40 text-[#00E5FF]"
                          : "text-[#A0A0B0] hover:text-white border border-transparent"
                      }`}
                    >
                      <span className="text-[11px] font-mono tracking-widest flex items-center gap-1.5">
                        <Cable size={13} /> MY NODE
                      </span>
                      <span className="text-[10px] text-[#A0A0B0]/80 leading-snug font-normal">
                        Via Lumen Bridge
                      </span>
                    </button>
                  </div>
                </div>

                {/* === CONNECT MY NODE — 3 STEPS === */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Cable className="w-4 h-4 text-[#00E5FF]" />
                      <span className="text-xs font-mono tracking-widest text-[#E8E8F0]">
                        CONNECT MY NODE
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
                    Connect <span className="text-[#E8E8F0]">your</span> Ergo
                    node in about a minute — no open ports.{" "}
                    <span className="text-[#00E5FF]">Docker</span> is the
                    recommended way: one command, copy → paste → done.
                  </p>

                  {!bridgeToken ? (
                    <button
                      type="button"
                      onClick={handleStartConnect}
                      disabled={creatingToken}
                      className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF] text-xs font-mono tracking-widest hover:bg-[#00E5FF]/15 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.985] transition-all"
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
                      {/* STEP 1 — DOCKER (primary) */}
                      <StepCard
                        n={1}
                        title="RUN WITH DOCKER"
                        subtitle="Recommended. Paste on the machine with your Ergo node (Docker + Linux host network)."
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
                          Builds image, starts{" "}
                          <span className="font-mono text-[#A0A0B0]">
                            lumen-bridge
                          </span>{" "}
                          with your token. Auto-restart after reboot. Needs Ergo
                          REST on{" "}
                          <span className="font-mono">127.0.0.1:9053</span>.
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
                            Token unknown on server (restart cleared memory).
                            Tap New token below, then re-run Docker.
                          </p>
                        )}
                      </StepCard>

                      {/* STEP 2 — STATUS */}
                      <StepCard
                        n={2}
                        title="WAIT FOR ONLINE"
                        subtitle={
                          bridgeOnline
                            ? "Connected. Use My Node mode — data is live."
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
                              USE MY NODE NOW
                            </button>
                          )}
                        </div>
                      </StepCard>

                      {/* ADVANCED — node / install.sh */}
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

                {/* === NODE URL (Lumen mode advanced) === */}
                {nodeMode === "lumen" && (
                  <div>
                    <label className="text-xs font-mono tracking-widest text-[#A0A0B0] block mb-2">
                      NODE REST API URL
                    </label>
                    <input
                      type="text"
                      value={tempUrl}
                      onChange={(e) => setTempUrl(e.target.value)}
                      className="w-full bg-[#0A0A0F] border border-white/20 focus:border-[#FF7A3D] rounded-2xl px-5 py-4 font-mono text-sm outline-none"
                      placeholder="/api/node or http://127.0.0.1:9053"
                    />
                    <p className="text-[10px] text-[#A0A0B0]/60 mt-2 px-1">
                      Default{" "}
                      <span className="text-[#00E5FF]">/api/node</span> proxies
                      to this server Ergo REST (:9053).
                    </p>
                  </div>
                )}

                {/* === PUBLIC ACCESS === */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[#00E5FF]" />
                      <span className="text-xs font-mono tracking-widest text-[#E8E8F0]">
                        PUBLIC ACCESS
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono tracking-widest px-2.5 py-1 rounded-full border ${
                        publicMode
                          ? "border-[#10B981]/40 text-[#10B981] bg-[#10B981]/10"
                          : "border-white/15 text-[#A0A0B0] bg-white/5"
                      }`}
                    >
                      {publicMode ? "ACTIVE" : "LOCAL ONLY"}
                    </span>
                  </div>

                  <p className="text-[11px] text-[#A0A0B0] leading-relaxed flex items-start gap-2">
                    {publicMode ? (
                      <>
                        <Shield className="w-3.5 h-3.5 mt-0.5 text-[#10B981] flex-shrink-0" />
                        <span>
                          <span className="text-[#10B981] font-medium">
                            Password is set
                          </span>
                          {" — "}remote visitors need Basic Auth /{" "}
                          <span className="font-mono text-[#E8E8F0]/80">
                            ?password=
                          </span>
                          . Localhost always open.
                        </span>
                      </>
                    ) : (
                      <>
                        <Info className="w-3.5 h-3.5 mt-0.5 text-[#F59E0B] flex-shrink-0" />
                        <span>
                          <span className="text-[#F59E0B] font-medium">
                            No password set (public access disabled)
                          </span>
                          {" — "}only localhost / SSH tunnel.
                        </span>
                      </>
                    )}
                  </p>

                  <div>
                    <label className="text-[10px] font-mono tracking-widest text-[#A0A0B0] block mb-2">
                      {publicMode ? "NEW PUBLIC PASSWORD" : "PUBLIC PASSWORD"}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                        className="w-full bg-[#0A0A0F] border border-white/20 focus:border-[#00E5FF] rounded-2xl px-5 py-3.5 pr-12 font-mono text-sm outline-none"
                        placeholder="min 10 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#A0A0B0] hover:text-white"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={savingPassword || newPassword.trim().length < 10}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-[#00E5FF]/35 bg-[#00E5FF]/10 text-[#00E5FF] text-xs font-mono tracking-widest hover:bg-[#00E5FF]/15 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.985] transition-all"
                  >
                    <KeyRound size={15} />
                    {savingPassword
                      ? "SAVING…"
                      : publicMode
                        ? "CHANGE PUBLIC PASSWORD"
                        : "SET PUBLIC PASSWORD"}
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <button
                    onClick={handleSave}
                    className="flex-1 py-4 rounded-2xl bg-[#FF7A3D] text-black font-semibold tracking-wider text-sm active:scale-[0.985] transition-all"
                  >
                    {nodeMode === "lumen" ? "SAVE & RECONNECT" : "DONE"}
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
                Bridge is outbound-only (allowlisted GETs). Docker:{" "}
                <span className="text-[#A0A0B0]">/bridge/DOCKER.md</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    );

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-2xl glass border border-white/10 text-[10px] sm:text-xs font-mono tracking-wider sm:tracking-widest hover:border-white/30 transition-all"
      >
        <Settings className="w-3.5 h-3.5" />
        <span className="sm:hidden">SETTINGS</span>
        <span className="hidden sm:inline">NODE SETTINGS</span>
        {bridgeOnline && (
          <span
            className="hidden sm:inline-flex w-1.5 h-1.5 rounded-full bg-[#10B981] status-dot"
            title="Bridge online"
          />
        )}
      </button>
      {modal}
    </>
  );
}
