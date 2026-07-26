"use client";

/**
 * My Oracle invite — typewriter CTA (same UX as My Node invite).
 */

import TypewriterInvite, { wakeInvite } from "./TypewriterInvite";

const WAKE_EVENT = "lumen-oracle-invite-wake";

const FULL_TEXT =
  "Connect your Ergo oracle to lumen.\nOpen Settings → My Oracle.";

export function wakeOracleInvite() {
  wakeInvite(WAKE_EVENT);
}

export default function ConnectOracleInvite({
  enabled,
  onOpenSettings,
  delayMs = 5000,
}: {
  enabled: boolean;
  onOpenSettings: () => void;
  delayMs?: number;
}) {
  return (
    <TypewriterInvite
      enabled={enabled}
      onOpenSettings={onOpenSettings}
      fullText={FULL_TEXT}
      wakeEvent={WAKE_EVENT}
      delayMs={delayMs}
      ariaLabel="Open settings to connect your Ergo oracle"
    />
  );
}
