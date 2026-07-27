"use client";

/**
 * Shared typewriter CTA (search mono, blinking _).
 * Used for My Node and My Oracle invites.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const TYPE_MS = 38;
const CURSOR_ONLY_MS = 700;
const LOOP_PAUSE_MS = 15_000;

export function wakeInvite(eventName: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(eventName));
}

export default function TypewriterInvite({
  enabled,
  onOpenSettings,
  fullText,
  wakeEvent,
  delayMs = 5000,
  ariaLabel = "Open settings",
  /** Fires once when the first type-out finishes (not on loop restarts). */
  onFirstComplete,
  /** When false, only type once (no 15s loop). */
  loop = true,
}: {
  enabled: boolean;
  onOpenSettings: () => void;
  fullText: string;
  wakeEvent: string;
  delayMs?: number;
  ariaLabel?: string;
  onFirstComplete?: () => void;
  loop?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [cycle, setCycle] = useState(0);
  const firstCompleteSent = useRef(false);
  const onFirstCompleteRef = useRef(onFirstComplete);
  onFirstCompleteRef.current = onFirstComplete;

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      setTyped("");
      firstCompleteSent.current = false;
      return;
    }
    const t = window.setTimeout(() => setOpen(true), delayMs);
    return () => window.clearTimeout(t);
  }, [enabled, delayMs]);

  useEffect(() => {
    if (!enabled) return;
    const onWake = () => {
      setOpen(true);
      setCycle((c) => c + 1);
    };
    window.addEventListener(wakeEvent, onWake);
    return () => window.removeEventListener(wakeEvent, onWake);
  }, [enabled, wakeEvent]);

  useEffect(() => {
    if (!open || !enabled) return;

    // After first type-out without loop: refresh text quietly (live stats)
    if (firstCompleteSent.current && !loop) {
      setTyped(fullText);
      return;
    }

    let cancelled = false;
    let typeTimer = 0;
    let pauseTimer = 0;
    let startTimer = 0;

    const clearTimers = () => {
      if (typeTimer) window.clearInterval(typeTimer);
      if (pauseTimer) window.clearTimeout(pauseTimer);
      if (startTimer) window.clearTimeout(startTimer);
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
          if (i >= fullText.length) {
            setTyped(fullText);
            window.clearInterval(typeTimer);
            typeTimer = 0;
            if (!firstCompleteSent.current) {
              firstCompleteSent.current = true;
              try {
                onFirstCompleteRef.current?.();
              } catch {
                /* */
              }
            }
            if (loop) {
              pauseTimer = window.setTimeout(() => {
                if (!cancelled) runCycle();
              }, LOOP_PAUSE_MS);
            }
            return;
          }
          setTyped(fullText.slice(0, i));
        }, TYPE_MS);
      }, CURSOR_ONLY_MS);
    };

    runCycle();
    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [open, enabled, cycle, fullText, loop]);

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
            key="typewriter-invite"
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
                  "0 0 0 1px rgba(232,232,240,0.08), 0 0 28px rgba(232,197,71,0.14)",
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
                aria-label={ariaLabel}
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
                <span className="sr-only">{fullText}</span>
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
