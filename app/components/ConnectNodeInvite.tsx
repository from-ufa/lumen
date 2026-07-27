"use client";

/**
 * My Node invite — thin wrapper over TypewriterInvite.
 */

import TypewriterInvite, { wakeInvite } from "./TypewriterInvite";

const WAKE_EVENT = "lumen-invite-wake";

const FULL_TEXT =
  "Connect your Ergo node to lumen.\nOpen Settings → My Node.";

/** Call from menus / map / orbit so a closed invite reappears (if still lumen mode). */
export function wakeConnectInvite() {
  wakeInvite(WAKE_EVENT);
}

export default function ConnectNodeInvite({
  enabled,
  onOpenSettings,
  delayMs = 5000,
  onFirstComplete,
}: {
  enabled: boolean;
  onOpenSettings: () => void;
  delayMs?: number;
  /** After first type-out finishes (for stacking bridge node stats). */
  onFirstComplete?: () => void;
}) {
  return (
    <TypewriterInvite
      enabled={enabled}
      onOpenSettings={onOpenSettings}
      fullText={FULL_TEXT}
      wakeEvent={WAKE_EVENT}
      delayMs={delayMs}
      onFirstComplete={onFirstComplete}
      ariaLabel="Open settings to connect your Ergo node"
    />
  );
}
