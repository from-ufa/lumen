/**
 * Bridge connect-invite policy (browser · mobile · Mini App — one React tree).
 *
 * Product rule: once a bridge token is configured, never show recruitment
 * typewriters ("Connect your node/oracle", hub join CTAs). Offline agent
 * is status (LIVE badge / Settings), not a re-prompt to connect.
 *
 * Token is the durable signal:
 * - localStorage (browser / Capacitor)
 * - Telegram vault hydrate → same localStorage (TS-1)
 *
 * Do not gate only on bridgeStatus.connected: reconnect flaps would flash
 * connect cards. Live status remains for badges / data, not for invites.
 */

export function hasBridgeConfigured(
  token: string | null | undefined
): boolean {
  return !!String(token ?? "").trim();
}

/**
 * Primary Connect*Invite + BridgeOperatorsInvite (join CTAs).
 * Shared by Node and Oracles pages.
 */
export function shouldShowBridgeConnectInvites(
  token: string | null | undefined
): boolean {
  return !hasBridgeConfigured(token);
}
