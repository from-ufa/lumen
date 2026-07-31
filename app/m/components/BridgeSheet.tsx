"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { toast } from "sonner";
import {
  createBridgeToken,
  loadBridgeToken,
  loadNodeMode,
  saveBridgeToken,
  saveNodeMode,
  type NodeMode,
} from "../../lib/node-api";
import { hapticImpact, hapticNotification } from "../../lib/telegram";
import { sheetSpring, sheetVariants } from "../lib/motion";

export default function BridgeSheet({
  open,
  onClose,
  token,
  mode,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  mode: NodeMode;
  onSaved: (token: string, mode: NodeMode) => void;
}) {
  const reduce = useReducedMotion();
  const [draft, setDraft] = useState(token);
  const [draftMode, setDraftMode] = useState<NodeMode>(mode);
  const [busy, setBusy] = useState(false);

  const save = useCallback(() => {
    const t = draft.trim();
    saveBridgeToken(t);
    saveNodeMode(draftMode);
    onSaved(t, draftMode);
    void hapticNotification("success");
    toast.success(t ? "Bridge saved" : "Bridge token cleared");
    onClose();
  }, [draft, draftMode, onClose, onSaved]);

  const mint = useCallback(async () => {
    setBusy(true);
    try {
      const { token: t } = await createBridgeToken("miniapp");
      setDraft(t);
      saveBridgeToken(t);
      saveNodeMode("my");
      setDraftMode("my");
      onSaved(t, "my");
      void hapticNotification("success");
      toast.success("Token created — run Bridge agent with it");
    } catch (e) {
      void hapticNotification("error");
      toast.error(e instanceof Error ? e.message : "Mint failed");
    } finally {
      setBusy(false);
    }
  }, [onSaved]);

  useEffect(() => {
    if (!open) return;
    setDraft(loadBridgeToken() || token);
    setDraftMode(loadNodeMode() || mode);
  }, [open, token, mode]);

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
            aria-label="Bridge settings"
            className="fixed inset-x-0 bottom-0 z-[90] max-h-[88dvh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#12121A] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            variants={reduce ? undefined : sheetVariants}
            initial={reduce ? false : "hidden"}
            animate="visible"
            exit="exit"
            transition={sheetSpring}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold tracking-tight">Bridge</h2>
              <button
                type="button"
                onClick={onClose}
                className="h-10 w-10 inline-flex items-center justify-center rounded-full border border-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] font-mono text-[#A0A0B0] tracking-wide mb-3">
              SOURCE
            </p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {(["lumen", "my"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setDraftMode(m);
                    void hapticImpact("light");
                  }}
                  className={`h-11 rounded-xl border font-mono text-xs tracking-wider ${
                    draftMode === m
                      ? "border-[#FF7A3D]/50 bg-[#FF7A3D]/15 text-[#FF7A3D]"
                      : "border-white/10 text-[#A0A0B0]"
                  }`}
                >
                  {m === "lumen" ? "LUMEN" : "MY NODE"}
                </button>
              ))}
            </div>

            <p className="text-[11px] font-mono text-[#A0A0B0] tracking-wide mb-2">
              BRIDGE TOKEN
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="lumen_…"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-xs text-[#E8E8F0] outline-none focus:border-[#FF7A3D]/40"
            />

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void mint()}
                className="flex-1 h-11 rounded-xl border border-white/15 bg-white/[0.06] font-mono text-[11px] tracking-wider disabled:opacity-50"
              >
                {busy ? "…" : "GENERATE"}
              </button>
              <button
                type="button"
                onClick={save}
                className="flex-1 h-11 rounded-xl border border-[#FF7A3D]/40 bg-[#FF7A3D]/20 text-[#FF7A3D] font-mono text-[11px] tracking-wider font-semibold"
              >
                SAVE
              </button>
            </div>
            <p className="mt-3 text-[10px] text-[#A0A0B0]/80 leading-relaxed">
              Paste token from agent or generate here, then run Bridge next to
              your Ergo node. Vault restore uses Telegram link flow.
            </p>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
