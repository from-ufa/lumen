"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

interface ConnectionSettingsProps {
  nodeUrl: string;
  setNodeUrl: (url: string) => void;
  isOnline: boolean;
  onReconnect: () => void;
  publicMode?: boolean;
  /** Called after password set/change so parent can refresh PUBLIC badge */
  onPublicModeChange?: (enabled: boolean) => void;
  /** Notify parent when modal opens/closes (hide viz floating controls) */
  onOpenChange?: (open: boolean) => void;
}

export default function ConnectionSettings({
  nodeUrl,
  setNodeUrl,
  isOnline,
  onReconnect,
  publicMode = false,
  onPublicModeChange,
  onOpenChange,
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

  // Portal target only exists client-side
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setTempUrl(nodeUrl);
      setNewPassword("");
      setShowPassword(false);
    }
  }, [open, nodeUrl]);

  // Lock body scroll while modal open
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
      localStorage.setItem("aether-node-url", tempUrl);
      toast.success("Node URL updated", { description: "Reconnecting..." });
      setTimeout(onReconnect, 120);
    }
    setModalOpen(false);
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
              className="glass relative z-10 w-full max-w-md max-h-[min(92dvh,760px)] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 sm:p-8 border border-white/10 shadow-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-6 sm:mb-8">
                <div>
                  <div className="font-mono text-xs tracking-[4px] text-[#FF7A3D]">
                    CONNECTION
                  </div>
                  <div className="text-2xl sm:text-3xl font-semibold tracking-tighter mt-1">
                    Ergo Node
                  </div>
                  <div
                    className={`mt-2 text-[10px] font-mono tracking-widest ${
                      isOnline ? "text-[#10B981]" : "text-[#EF4444]"
                    }`}
                  >
                    {isOnline ? "● ONLINE" : "● OFFLINE"}
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

              <div className="space-y-6">
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
                    autoFocus
                  />
                  <p className="text-[10px] text-[#A0A0B0]/60 mt-2 px-1">
                    Default{" "}
                    <span className="text-[#00E5FF]">/api/node</span> proxies
                    to this server Ergo REST (:9053). Direct URL only if the
                    browser can reach the node (CORS).
                  </p>
                </div>

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
                          {" — "}only localhost / SSH tunnel. Set a password
                          below (min 10 chars) to enable Public Mode.
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
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-[#A0A0B0]/55 mt-1.5 px-1">
                      Stored in server file{" "}
                      <span className="font-mono text-[#A0A0B0]/80">
                        .aether-public-password
                      </span>{" "}
                      (chmod 600). Not in env / git.
                    </p>
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

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    className="flex-1 py-4 rounded-2xl bg-[#FF7A3D] text-black font-semibold tracking-wider text-sm active:scale-[0.985] transition-all"
                  >
                    SAVE & RECONNECT
                  </button>
                  <button
                    onClick={onReconnect}
                    className="flex items-center justify-center gap-2 px-6 py-4 rounded-2xl border border-white/20 hover:bg-white/5 text-sm font-mono tracking-widest active:scale-[0.985]"
                  >
                    <RefreshCw size={15} /> RECONNECT
                  </button>
                </div>
              </div>

              <div className="mt-6 sm:mt-8 pt-6 border-t border-white/10 text-xs text-[#A0A0B0]/70 font-mono tracking-[0.5px]">
                Aether connects to your local Ergo node via REST. Keep your node
                running with{" "}
                <span className="text-[#FF7A3D]">/info</span> endpoint exposed.
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
      </button>
      {modal}
    </>
  );
}
