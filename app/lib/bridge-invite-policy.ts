/**
 * Bridge invite policy (browser · mobile · Mini App — one React tree).
 *
 * Two layers:
 * 1) recruit — no token: Connect* typewriters + hub join CTAs
 * 2) status  — token configured: hub live counts only (how many online now)
 *
 * Token is the durable signal (localStorage / TG vault hydrate).
 * Do not gate on bridgeStatus.connected alone — reconnect flaps would flash.
 */

export function hasBridgeConfigured(
  token: string | null | undefined
): boolean {
  return !!String(token ?? "").trim();
}

/** Primary Connect*Invite + BridgeOperatorsInvite mode="recruit" */
export function shouldShowBridgeConnectInvites(
  token: string | null | undefined
): boolean {
  return !hasBridgeConfigured(token);
}

/**
 * Hub status typewriter (counts only, no join CTA).
 * Shown once the user already has a bridge token.
 */
export function shouldShowBridgeHubStatus(
  token: string | null | undefined
): boolean {
  return hasBridgeConfigured(token);
}
