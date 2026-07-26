"use client";

/**
 * Connect-node invite — typewriter field (search font).
 * - Appears after delay; stays until user closes with ×
 * - Reopens on UI activity (wakeConnectInvite)
 * - Typewriter loops with 15s pause between cycles
 * - Hidden when My Node is connected (enabled=false)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const LS_DISMISS_LEGACY = "lumen-connect-node-invite-dismissed";
const WAKE_EVENT = "lumen-invite-wake";

const FULL_TEXT =
  "Connect your Ergo node to lumen.\nOpen Settings → My Node.";

const TYPE_MS = 38;
const CURSOR_ONLY_MS = 700;
const LOOP_PAUSE_MS = 15_000;

/** Call from menus / map / orbit so a closed invite reappears (if still lumen mode). */
export function wakeConnectInvite() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WAKE_EVENT));
}

export default function ConnectNodeInvite({
  enabled,
  onOpenSettings,
  delayMs = 5000,
}: {
  enabled: boolean;
  onOpenSettings: () => void;
  delayMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    try {
      localStorage.removeItem(LS_DISMISS_LEGACY);
    } catch {
      /* */
    }
  }, []);

  // First show after dwell; never when My Node (enabled=false)
  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      setTyped("");
      return;
    }
    const t = window.setTimeout(() => setOpen(true), delayMs);
    return () => window.clearTimeout(t);
  }, [enabled, delayMs]);

  // Reopen when user interacts with menus / map / nodes
  useEffect(() => {
    if (!enabled) return;
    const onWake = () => {
      setOpen(true);
      setCycle((c) => c + 1);
    };
    window.addEventListener(WAKE_EVENT, onWake);
    return () => window.removeEventListener(WAKE_EVENT, onWake);
  }, [enabled]);

  // Typewriter loop: caret → type → 15s pause → clear → repeat
  useEffect(() => {
    if (!open || !enabled) return;

    let cancelled = false;
    let typeTimer = 0;
    let pauseTimer = 0;
    let startTimer = 0;

    const clearTimers = () => {
      if (typeTimer) window.clearInterval(typeTimer);
      if (pauseTimer) window.clearTimeout(pauseTimer);
      if (startTimer) window.clearTimeout(startTimer);
      typeTimer = 0;
      pauseTimer = 0;
      startTimer = 0;
    };

    const runCycle = () => {
      if (cancelled) return;
      setTyped("");
      let i = 0;

      startTimer = window.setTimeout(() => {
        if (cancelled) return;
        typeTimer = window.setInterval(() => {
          if (cancelled) return;
          i += 1;
          if (i >= FULL_TEXT.length) {
            setTyped(FULL_TEXT);
            window.clearInterval(typeTimer);
            typeTimer = 0;
            pauseTimer = window.setTimeout(() => {
              if (cancelled) return;
              runCycle();
            }, LOOP_PAUSE_MS);
            return;
          }
          setTyped(FULL_TEXT.slice(0, i));
        }, TYPE_MS);
      }, CURSOR_ONLY_MS);
    };

    runCycle();

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [open, enabled, cycle]);

  const close = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    setOpen(false);
    setTyped("");
  }, []);

  const lines = useMemo(() => typed.split("\n"), [typed]);

  if (!enabled) return null;

  return (
    <div className="relative flex justify-end w-full">
      <AnimatePresence>
        {open && (
          <motion.div
            key="connect-invite"
            initial={{ opacity: 0, scaleX: 0.06, scaleY: 0.4 }}
            animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleX: 0.1, scaleY: 0.4 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            style={{ originX: 1, originY: 0, transformOrigin: "right top" }}
            className="relative w-full max-w-[min(100%,22rem)] md:max-w-[22rem]"
          >
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -inset-2 rounded-2xl"
              animate={{ opacity: [0.25, 0.55, 0.25] }}
              transition={{ duration: 2.8, ease: "easeInOut", repeat: Infinity }}
              style={{
                boxShadow:
                  "0 0 0 1px rgba(232,232,240,0.08), 0 0 28px rgba(255,122,61,0.12)",
              }}
            />

            <div
              className="
                relative w-full rounded-2xl border border-white/10
                bg-[#0A0A0F]/92 backdrop-blur-xl
                shadow-[0_8px_32px_rgba(0,0,0,0.45)]
                px-3.5 py-2.5 pr-9
                transition-colors duration-300
                hover:border-white/20
              "
            >
              {/* Close — session only; wake on next UI activity */}
              <button
                type="button"
                onClick={close}
                aria-label="Close invite"
                className="
                  absolute top-2 right-2 z-10
                  flex h-6 w-6 items-center justify-center rounded-md
                  font-mono text-[14px] leading-none text-[#A0A0B0]
                  hover:text-[#E8E8F0] hover:bg-white/[0.06]
                  transition-colors
                "
              >
                ×
              </button>

              <button
                type="button"
                onClick={onOpenSettings}
                className="w-full text-left focus:outline-none"
                aria-label="Open settings to connect your Ergo node"
              >
                <div
                  className="
                    lumen-search-input min-h-[2.75rem] w-full
                    font-mono tracking-wide text-[#E8E8F0]
                    whitespace-pre-wrap break-words
                  "
                  style={{ lineHeight: 1.45 }}
                >
                  {typed.length === 0 ? (
                    <span
                      className="lumen-search-caret text-[#E8E8F0]"
                      aria-hidden
                    >
                      _
                    </span>
                  ) : (
                    lines.map((line, li) => (
                      <span key={li} className="block">
                        {line}
                        {li === lines.length - 1 && (
                          <span
                            className="lumen-search-caret ml-0.5 text-[#E8E8F0]"
                            aria-hidden
                          >
                            _
                          </span>
                        )}
                      </span>
                    ))
                  )}
                </div>
                <span className="sr-only">{FULL_TEXT}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!open && (
          <motion.div
            key="seed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute right-1 top-0.5 pointer-events-none font-mono text-[#E8E8F0]"
            aria-hidden
          >
            <span className="lumen-search-caret text-sm">_</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
