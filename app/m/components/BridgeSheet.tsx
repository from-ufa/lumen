"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Copy, X } from "lucide-react";
import { toast } from "sonner";
import {
  bridgeDockerCommand,
  bridgeInstallCommand,
  bridgeRunCommand,
  createBridgeToken,
  loadBridgeToken,
  loadNodeMode,
  saveBridgeToken,
  saveNodeMode,
  type NodeMode,
} from "../../lib/node-api";
import { hapticImpact, hapticNotification } from "../../lib/telegram";
import { sheetSpring, sheetVariants } from "../lib/motion";
import { useMiniI18n } from "../lib/MiniI18n";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CopyBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const { t } = useMiniI18n();
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    if (!value) return;
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      void hapticImpact("light");
      toast.success(t("toast_copied"));
      window.setTimeout(() => setCopied(false), 1600);
    } else {
      toast.error(t("toast_copy_failed"));
    }
  }, [value, t]);

  if (!value) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-mono text-[#A0A0B0] tracking-wide">
          {label}
        </p>
        <button
          type="button"
          onClick={() => void onCopy()}
          className="h-8 px-2.5 rounded-lg border border-white/10 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-[#E8E8F0] active:scale-[0.97]"
        >
          {copied ? (
            <Check className="w-3 h-3 text-[#10B981]" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <pre className="rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-[10px] leading-relaxed text-[#E8E8F0] whitespace-pre-wrap break-all max-h-36 overflow-y-auto">
        {value}
      </pre>
      {hint ? (
        <p className="mt-1.5 text-[10px] text-[#A0A0B0]/85 leading-relaxed">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

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
  const { t } = useMiniI18n();
  const [draft, setDraft] = useState(token);
  const [draftMode, setDraftMode] = useState<NodeMode>(mode);
  const [busy, setBusy] = useState(false);

  const tok = draft.trim();
  const installCmd = useMemo(() => bridgeInstallCommand(), []);
  const dockerCmd = useMemo(
    () => (tok ? bridgeDockerCommand(tok) : ""),
    [tok]
  );
  const runCmd = useMemo(() => (tok ? bridgeRunCommand(tok) : ""), [tok]);

  const save = useCallback(() => {
    const next = draft.trim();
    saveBridgeToken(next);
    saveNodeMode(draftMode);
    onSaved(next, draftMode);
    void hapticNotification("success");
    toast.success(next ? t("toast_bridge_saved") : t("toast_bridge_cleared"));
    onClose();
  }, [draft, draftMode, onClose, onSaved, t]);

  const mint = useCallback(async () => {
    setBusy(true);
    try {
      const { token: minted } = await createBridgeToken("miniapp");
      setDraft(minted);
      saveBridgeToken(minted);
      saveNodeMode("my");
      setDraftMode("my");
      onSaved(minted, "my");
      void hapticNotification("success");
      toast.success(t("toast_token_created"));
    } catch (e) {
      void hapticNotification("error");
      toast.error(e instanceof Error ? e.message : t("toast_mint_failed"));
    } finally {
      setBusy(false);
    }
  }, [onSaved, t]);

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
            aria-label={t("bridge_sheet_title")}
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
                {t("bridge_sheet_title")}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="h-10 w-10 inline-flex items-center justify-center rounded-full border border-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] font-mono text-[#A0A0B0] tracking-wide mb-3">
              {t("bridge_source")}
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
                  {m === "lumen" ? "LUMEN" : t("source_my")}
                </button>
              ))}
            </div>

            <p className="text-[11px] font-mono text-[#A0A0B0] tracking-wide mb-2">
              {t("bridge_token_label")}
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="lumen_…"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-xs text-[#E8E8F0] outline-none focus:border-[#FF7A3D]/40"
            />

            <div className="flex gap-2 mt-4 mb-5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void mint()}
                className="flex-1 h-11 rounded-xl border border-white/15 bg-white/[0.06] font-mono text-[11px] tracking-wider disabled:opacity-50"
              >
                {busy ? "…" : t("generate")}
              </button>
              <button
                type="button"
                onClick={save}
                className="flex-1 h-11 rounded-xl border border-[#FF7A3D]/40 bg-[#FF7A3D]/20 text-[#FF7A3D] font-mono text-[11px] tracking-wider font-semibold"
              >
                {t("save")}
              </button>
            </div>

            <p className="text-[11px] font-mono text-[#A0A0B0] tracking-wide mb-3">
              {t("run_next_to_node")}
            </p>

            {tok ? (
              <CopyBlock
                label={t("docker_label")}
                value={dockerCmd}
                hint={t("docker_hint")}
              />
            ) : (
              <p className="mb-4 text-[11px] text-[#A0A0B0] leading-relaxed">
                {t("need_token_docker")}
              </p>
            )}

            <CopyBlock
              label={t("install_label")}
              value={installCmd}
              hint={t("install_hint")}
            />

            {tok ? (
              <CopyBlock
                label={t("run_label")}
                value={runCmd}
                hint={t("run_hint")}
              />
            ) : null}

            <p className="mt-1 mb-2 text-[10px] text-[#A0A0B0]/80 leading-relaxed">
              {t("bridge_footer")}
            </p>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
