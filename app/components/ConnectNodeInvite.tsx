"use client";

/**
 * Persistent call-to-action: connect your Ergo node via My Node / Settings.
 * After delay expands once, then STAYS and gently pulses until user is on My Node.
 * Purpose: invite operators into the lumen network.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cable, Settings } from "lucide-react";

/** Legacy key — clear so one-time dismiss never hides the invite again */
const LS_DISMISS_LEGACY = "lumen-connect-node-invite-dismissed";

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
  const [open, setOpen] = useState(false);

  // Wipe old permanent dismiss so CTA always comes back
  useEffect(() => {
    try {
      localStorage.removeItem(LS_DISMISS_LEGACY);
    } catch {
      /* */
    }
  }, []);

  // Expand after dwell time; stays open while enabled
  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      return;
    }
    const t = window.setTimeout(() => setOpen(true), delayMs);
    return () => window.clearTimeout(t);
  }, [enabled, delayMs]);

  if (!enabled) return null;

  return (
    <div className="relative flex justify-end w-full">
      <AnimatePresence>
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
            {/* Outer pulse halo — keeps drawing the eye */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -inset-3 rounded-[1.35rem]"
              animate={{
                opacity: [0.35, 0.75, 0.35],
                scale: [1, 1.03, 1],
              }}
              transition={{
                duration: 2.8,
                ease: "easeInOut",
                repeat: Infinity,
              }}
              style={{
                background:
                  "radial-gradient(ellipse 80% 70% at 70% 50%, rgba(255,122,61,0.35), rgba(0,229,255,0.1) 50%, transparent 72%)",
                filter: "blur(6px)",
              }}
            />

            <motion.div
              className="relative overflow-hidden rounded-2xl border backdrop-blur-2xl"
              animate={{
                borderColor: [
                  "rgba(255,122,61,0.28)",
                  "rgba(255,122,61,0.55)",
                  "rgba(0,229,255,0.35)",
                  "rgba(255,122,61,0.28)",
                ],
                boxShadow: [
                  "0 16px 40px rgba(0,0,0,0.4), 0 0 0 0 rgba(255,122,61,0)",
                  "0 18px 48px rgba(0,0,0,0.45), 0 0 28px 2px rgba(255,122,61,0.22)",
                  "0 16px 44px rgba(0,0,0,0.42), 0 0 24px 1px rgba(0,229,255,0.12)",
                  "0 16px 40px rgba(0,0,0,0.4), 0 0 0 0 rgba(255,122,61,0)",
                ],
              }}
              transition={{
                duration: 3.2,
                ease: "easeInOut",
                repeat: Infinity,
              }}
              style={{
                background:
                  "linear-gradient(135deg, rgba(18,18,28,0.94) 0%, rgba(12,14,22,0.9) 55%, rgba(22,12,10,0.92) 100%)",
              }}
            >
              {/* Soft sweep loop */}
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-1/3"
                animate={{ x: ["-40%", "280%"], opacity: [0, 0.45, 0] }}
                transition={{
                  duration: 4.5,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatDelay: 1.2,
                }}
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
                }}
              />

              <div className="relative px-4 py-3.5 sm:px-4 sm:py-4">
                <div className="flex items-start gap-3">
                  <motion.div
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#FF7A3D]/35"
                    animate={{
                      boxShadow: [
                        "0 0 12px rgba(255,122,61,0.2)",
                        "0 0 22px rgba(255,122,61,0.45)",
                        "0 0 12px rgba(255,122,61,0.2)",
                      ],
                    }}
                    transition={{
                      duration: 2.2,
                      ease: "easeInOut",
                      repeat: Infinity,
                    }}
                    style={{
                      background:
                        "linear-gradient(145deg, rgba(255,122,61,0.25), rgba(0,229,255,0.1))",
                    }}
                  >
                    <Cable className="h-4 w-4 text-[#FF7A3D]" />
                  </motion.div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono tracking-[0.22em] text-[#FF7A3D] uppercase">
                        Join the network
                      </span>
                      <span
                        className="inline-flex h-1.5 w-1.5 rounded-full bg-[#FF7A3D] status-dot"
                        aria-hidden
                      />
                    </div>
                    <p className="mt-1 text-[13px] sm:text-sm font-medium text-[#F0F0F6] leading-snug tracking-tight">
                      Connect your Ergo node to lumen
                    </p>
                    <p className="mt-1 text-[11px] text-[#8B8B9A] leading-relaxed">
                      Run the Bridge — show your height, peers, and map. One
                      token. Settings → My Node.
                    </p>

                    <div className="mt-3">
                      <motion.button
                        type="button"
                        onClick={onOpenSettings}
                        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[10px] font-mono tracking-[0.16em] uppercase text-black active:scale-[0.98]"
                        animate={{
                          boxShadow: [
                            "0 6px 18px rgba(255,122,61,0.25)",
                            "0 8px 28px rgba(255,122,61,0.45)",
                            "0 6px 18px rgba(255,122,61,0.25)",
                          ],
                        }}
                        transition={{
                          duration: 2.4,
                          ease: "easeInOut",
                          repeat: Infinity,
                        }}
                        style={{
                          background:
                            "linear-gradient(120deg, #FF7A3D 0%, #FF9A5C 50%, #00E5FF 160%)",
                        }}
                      >
                        <Settings className="h-3 w-3" />
                        Open settings
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seed pulse while waiting to expand */}
      <AnimatePresence>
        {!open && (
          <motion.div
            key="seed"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.8 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-2 bottom-0 pointer-events-none w-0 h-0"
            aria-hidden
          >
            <span className="relative flex h-2.5 w-2.5 -translate-y-1">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF7A3D]/5" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#FF7A3D] shadow-[0_0_14px_rgba(255,122,61,0.85)]" />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
