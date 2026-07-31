"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { toast } from "sonner";
import { hapticImpact, hapticNotification } from "../../lib/telegram";
import { sheetSpring, sheetVariants } from "../lib/motion";

type MeResponse = {
  ok?: boolean;
  hasChat?: boolean;
  disabled?: boolean;
  error?: string;
  subscriptions?: Array<{ prefs?: { enabled?: boolean } }>;
};

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
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(false);
  const [hasChat, setHasChat] = useState<boolean | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!bridgeToken) {
      setOn(false);
      setHasChat(null);
      setHint("Save a bridge token first (Me → Bridge)");
      return;
    }
    try {
      const res = await fetch("/api/tg/alerts/me", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as MeResponse;
      if (data.disabled) {
        setHint("Bot not configured on server");
        return;
      }
      if (!res.ok) {
        setHasChat(false);
        setOn(false);
        setHint(
          data.error === "auth_required"
            ? "Open Mini App from @ergolumen_bot so we can verify you"
            : data.error || "Could not load alerts"
        );
        return;
      }
      setHasChat(!!data.hasChat);
      const enabled = (data.subscriptions || []).some((s) => s.prefs?.enabled);
      setOn(enabled);
      if (!data.hasChat) setHint("Send /start to @ergolumen_bot first");
      else if (enabled)
        setHint("Watchdog: bridge offline · oracle · lag");
      else setHint("Opt-in for private problem alerts");
    } catch {
      setHint("Network error");
    }
  }, [bridgeToken]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const toggle = async (next: boolean) => {
    if (!bridgeToken || busy) return;
    setBusy(true);
    try {
      if (next) {
        const res = await fetch("/api/tg/alerts/subscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bridgeToken,
            scopes: { node: true, oracle: true },
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
          toast.error(data.hint || data.error || "Could not enable");
          void hapticNotification("error");
          return;
        }
        setOn(true);
        setHasChat(true);
        setHint(
          data.testSent
            ? "Enabled · test message sent"
            : data.hint || "Alerts on"
        );
        toast.success("Telegram alerts on");
        void hapticNotification("success");
      } else {
        const res = await fetch("/api/tg/alerts/unsubscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mute: true }),
        });
        if (!res.ok) {
          toast.error("Could not mute");
          return;
        }
        setOn(false);
        setHint("Muted");
        toast.message("Alerts muted");
        void hapticImpact("light");
      }
    } catch {
      toast.error("Network error");
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
        toast.error(data.error || "Test failed");
        void hapticNotification("error");
        return;
      }
      toast.success("Test sent");
      void hapticNotification("success");
    } catch {
      toast.error("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close"
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
            aria-label="Telegram alerts"
            className="fixed inset-x-0 bottom-0 z-[90] max-h-[88dvh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#12121A] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            variants={reduce ? undefined : sheetVariants}
            initial={reduce ? false : "hidden"}
            animate="visible"
            exit="exit"
            transition={sheetSpring}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold tracking-tight">Alerts</h2>
              <button
                type="button"
                onClick={onClose}
                className="h-10 w-10 inline-flex items-center justify-center rounded-full border border-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[12px] text-[#A0A0B0] leading-relaxed mb-4">
              Private Telegram messages when bridge drops, recovers, or oracle
              looks unhealthy.
            </p>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 mb-3">
              <div>
                <div className="text-sm font-medium">Watchdog</div>
                <div className="text-[11px] text-[#A0A0B0] mt-0.5">
                  {on ? "Armed" : "Off"}
                  {hasChat === false ? " · need /start" : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={busy || !bridgeToken}
                onClick={() => void toggle(!on)}
                className={`h-9 px-4 rounded-full font-mono text-[10px] tracking-wider border disabled:opacity-40 ${
                  on
                    ? "border-[#10B981]/40 bg-[#10B981]/15 text-[#10B981]"
                    : "border-white/15 text-[#A0A0B0]"
                }`}
              >
                {busy ? "…" : on ? "ON" : "OFF"}
              </button>
            </div>

            {hint ? (
              <p className="text-[11px] font-mono text-[#A0A0B0] mb-4 leading-relaxed">
                {hint}
              </p>
            ) : null}

            <button
              type="button"
              disabled={busy || !on}
              onClick={() => void sendTest()}
              className="w-full h-11 rounded-xl border border-white/15 bg-white/[0.06] font-mono text-[11px] tracking-wider disabled:opacity-40"
            >
              SEND TEST
            </button>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
