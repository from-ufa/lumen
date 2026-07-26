"use client";

/**
 * Connect-node invite — typewriter terminal field (search font).
 * Shell expands after delay, stays open; text types letter by letter with blinking _.
 * No icons / logos. Click opens Settings → My Node.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/** Legacy key — clear so old permanent dismiss never hides the invite */
const LS_DISMISS_LEGACY = "lumen-connect-node-invite-dismissed";

const FULL_TEXT =
  "Connect your Ergo node to lumen.\nOpen Settings → My Node.";

const TYPE_MS = 38;
const CURSOR_ONLY_MS = 700;

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
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem(LS_DISMISS_LEGACY);
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      setTyped("");
      setDone(false);
      return;
    }
    const t = window.setTimeout(() => setOpen(true), delayMs);
    return () => window.clearTimeout(t);
  }, [enabled, delayMs]);

  // Typewriter: empty + blinking _ first, then char by char
  useEffect(() => {
    if (!open || !enabled) return;

    setTyped("");
    setDone(false);

    let i = 0;
    let intervalId = 0;
    const startId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        i += 1;
        if (i >= FULL_TEXT.length) {
          setTyped(FULL_TEXT);
          setDone(true);
          window.clearInterval(intervalId);
          return;
        }
        setTyped(FULL_TEXT.slice(0, i));
      }, TYPE_MS);
    }, CURSOR_ONLY_MS);

    return () => {
      window.clearTimeout(startId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [open, enabled]);

  const lines = useMemo(() => typed.split("\n"), [typed]);

  if (!enabled) return null;

  return (
    <div className="relative flex justify-end w-full">
      <AnimatePresence>
        {open && (
          <motion.div
            key="connect-invite"
            initial={{
              opacity: 0,
              scaleX: 0.06,
              scaleY: 0.4,
            }}
            animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleX: 0.1, scaleY: 0.4 }}
            transition={{
              duration: 0.7,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{ originX: 1, originY: 0, transformOrigin: "right top" }}
            className="relative w-full max-w-[min(100%,22rem)] md:max-w-[22rem]"
          >
            {/* Soft persistent pulse — attention without icons */}
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

            <button
              type="button"
              onClick={onOpenSettings}
              className="
                group relative w-full text-left rounded-2xl border border-white/10
                bg-[#0A0A0F]/92 backdrop-blur-xl
                shadow-[0_8px_32px_rgba(0,0,0,0.45)]
                px-3.5 py-2.5
                transition-colors duration-300
                hover:border-white/20
                focus:outline-none focus-visible:border-[#E8E8F0]/35
              "
              aria-label="Open settings to connect your Ergo node"
            >
              {/* Typewriter field — same language as lumen-search-input */}
              <div
                className="
                  lumen-search-input min-h-[2.75rem] w-full
                  font-mono tracking-wide text-[#E8E8F0]
                  whitespace-pre-wrap break-words
                "
                style={{ lineHeight: 1.45 }}
              >
                {typed.length === 0 ? (
                  <span className="lumen-search-caret text-[#E8E8F0]" aria-hidden>
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

              {/* Invisible spacer so height doesn't jump while typing short first line */}
              <span className="sr-only">{FULL_TEXT}</span>
            </button>

            {/* Hint under field after type finishes */}
            <AnimatePresence>
              {done && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.55 }}
                  exit={{ opacity: 0 }}
                  className="mt-1.5 px-1 text-right font-mono text-[10px] tracking-wide text-[#E8E8F0]"
                >
                  tap to open settings
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seed before expand */}
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
