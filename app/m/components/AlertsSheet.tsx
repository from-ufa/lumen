"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { toast } from "sonner";
import { hapticImpact, hapticNotification } from "../../lib/telegram";
import { sheetSpring, sheetVariants } from "../lib/motion";
import { useMiniI18n } from "../lib/MiniI18n";

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
  const { t } = useMiniI18n();
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(false);
  const [hasChat, setHasChat] = useState<boolean | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!bridgeToken) {
      setOn(false);
      setHasChat(null);
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
        setHint(
          data.error === "auth_required"
            ? t("hint_auth")
            : data.error || t("hint_load_fail")
        );
        return;
      }
      setHasChat(!!data.hasChat);
      const enabled = (data.subscriptions || []).some((s) => s.prefs?.enabled);
      setOn(enabled);
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
      } else {
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
      }
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
            className="fixed inset-x-0 bottom-0 z-[90] max-h-[88dvh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#12121A] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            variants={reduce ? undefined : sheetVariants}
            initial={reduce ? false : "hidden"}
            animate="visible"
            exit="exit"
            transition={sheetSpring}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold tracking-tight">
                {t("alerts_sheet_title")}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="h-10 w-10 inline-flex items-center justify-center rounded-full border border-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[12px] text-[#A0A0B0] leading-relaxed mb-4">
              {t("alerts_intro")}
            </p>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 mb-3">
              <div>
                <div className="text-sm font-medium">{t("watchdog")}</div>
                <div className="text-[11px] text-[#A0A0B0] mt-0.5">
                  {on ? t("armed") : t("off")}
                  {hasChat === false ? t("need_start") : ""}
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
                {busy ? "…" : on ? t("on") : t("off_btn")}
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
              {t("send_test")}
            </button>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
