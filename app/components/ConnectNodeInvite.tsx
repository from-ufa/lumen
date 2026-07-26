"use client";

/**
 * Soft invite to connect your own Ergo node via Settings.
 * Appears once after delay, expands from a single point.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cable, Settings, X } from "lucide-react";

const LS_DISMISS = "lumen-connect-node-invite-dismissed";

export default function ConnectNodeInvite({
  /** Only show when browsing lumen host (not already My Node) */
  enabled,
  onOpenSettings,
  delayMs = 5000,
}: {
  enabled: boolean;
  onOpenSettings: () => void;
  delayMs?: number;
}) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(LS_DISMISS) === "1") {
        setDismissed(true);
      }
    } catch {
      /* private mode */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !enabled || dismissed) return;
    const t = window.setTimeout(() => setOpen(true), delayMs);
    return () => window.clearTimeout(t);
  }, [ready, enabled, dismissed, delayMs]);

  // Hide if user switches to My Node while panel is open
  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  const dismiss = (persist: boolean) => {
    setOpen(false);
    setDismissed(true);
    if (persist) {
      try {
        localStorage.setItem(LS_DISMISS, "1");
      } catch {
        /* */
      }
    }
  };

  const goSettings = () => {
    dismiss(false);
    onOpenSettings();
  };

  if (!ready || dismissed || !enabled) return null;

  // No min-height when closed — must not disturb badge → toggle spacing
  return (
    <div className="relative flex justify-end w-full">
      <AnimatePresence mode="wait">
        {open && (
          <motion.div
            key="connect-invite"
            initial={{
              opacity: 0,
              scaleX: 0.08,
              scaleY: 0.35,
              filter: "blur(10px)",
            }}
            animate={{
              opacity: 1,
              scaleX: 1,
              scaleY: 1,
              filter: "blur(0px)",
            }}
            exit={{
              opacity: 0,
              scaleX: 0.12,
              scaleY: 0.4,
              filter: "blur(8px)",
              transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
            }}
            transition={{
              duration: 0.75,
              ease: [0.16, 1, 0.3, 1],
              opacity: { duration: 0.45 },
              filter: { duration: 0.55 },
            }}
            style={{ originX: 1, originY: 1, transformOrigin: "right bottom" }}
            className="relative w-full max-w-[min(100%,22rem)] md:max-w-[22rem]"
          >
            {/* Soft bloom behind card */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 rounded-full opacity-70"
              style={{
                background:
                  "radial-gradient(ellipse 70% 60% at 80% 50%, rgba(255,122,61,0.22), rgba(0,229,255,0.06) 45%, transparent 70%)",
              }}
            />

            <div
              className="relative overflow-hidden rounded-2xl border border-white/[0.1] backdrop-blur-2xl"
              style={{
                background:
                  "linear-gradient(135deg, rgba(18,18,28,0.92) 0%, rgba(12,14,22,0.88) 55%, rgba(18,12,10,0.9) 100%)",
                boxShadow:
                  "0 20px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
              }}
            >
              {/* Expanding light sweep */}
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3"
                initial={{ x: "-120%", opacity: 0 }}
                animate={{ x: "320%", opacity: [0, 0.5, 0] }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
                }}
              />

              <div className="relative px-4 py-3.5 sm:px-4 sm:py-4">
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#FF7A3D]/30"
                    style={{
                      background:
                        "linear-gradient(145deg, rgba(255,122,61,0.22), rgba(0,229,255,0.08))",
                      boxShadow: "0 0 20px rgba(255,122,61,0.2)",
                    }}
                  >
                    <Cable className="h-4 w-4 text-[#FF7A3D]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-mono tracking-[0.22em] text-[#FF7A3D]/90 uppercase">
                      Your node · My Node
                    </div>
                    <p className="mt-1 text-[13px] sm:text-sm font-medium text-[#F0F0F6] leading-snug tracking-tight">
                      Connect your Ergo node to lumen
                    </p>
                    <p className="mt-1 text-[11px] text-[#8B8B9A] leading-relaxed">
                      Bridge in one click — your height, peers, and map. Open
                      Settings to attach.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={goSettings}
                        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[10px] font-mono tracking-[0.16em] uppercase text-black transition-transform active:scale-[0.98]"
                        style={{
                          background:
                            "linear-gradient(120deg, #FF7A3D 0%, #FF9A5C 50%, #00E5FF 160%)",
                          boxShadow: "0 8px 24px rgba(255,122,61,0.28)",
                        }}
                      >
                        <Settings className="h-3 w-3" />
                        Open settings
                      </button>
                      <button
                        type="button"
                        onClick={() => dismiss(true)}
                        className="rounded-full px-3 py-1.5 text-[10px] font-mono tracking-[0.14em] uppercase text-[#7A7A88] hover:text-[#C8C8D0] transition-colors"
                      >
                        Not now
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => dismiss(true)}
                    aria-label="Dismiss"
                    className="shrink-0 rounded-full p-1 text-[#5A5A68] hover:text-white/80 hover:bg-white/[0.06] transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seed sits in-flow only as 0×0 — no layout reserve */}
      <AnimatePresence>
        {!open && enabled && !dismissed && (
          <motion.div
            key="seed"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.6 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-2 bottom-0 pointer-events-none w-0 h-0"
            aria-hidden
          >
            <span className="relative flex h-2 w-2 -translate-y-1">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF7A3D]/45" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#FF7A3D] shadow-[0_0_12px_rgba(255,122,61,0.8)]" />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
