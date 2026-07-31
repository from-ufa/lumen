/**
 * Client-safe alert catalog (no Node fs).
 * Used by Mini App Alerts hub + server engine mute checks.
 */

export const ALERT_CATALOG = [
  {
    id: "bridge.offline",
    group: "bridge" as const,
    severity: "critical" as const,
  },
  {
    id: "node.unreachable",
    group: "node" as const,
    severity: "critical" as const,
  },
  {
    id: "node.peers_low",
    group: "node" as const,
    severity: "warn" as const,
  },
  {
    id: "node.sync_lag",
    group: "node" as const,
    severity: "warn" as const,
  },
  {
    id: "node.height_stuck",
    group: "node" as const,
    severity: "warn" as const,
  },
  {
    id: "oracle.agent_down",
    group: "oracle" as const,
    severity: "critical" as const,
  },
  {
    id: "oracle.post_lag",
    group: "oracle" as const,
    severity: "warn" as const,
  },
  {
    id: "oracle.missed_refresh",
    group: "oracle" as const,
    severity: "warn" as const,
  },
  {
    id: "oracle.low_gas",
    group: "oracle" as const,
    severity: "warn" as const,
  },
] as const;

export type AlertCatalogId = (typeof ALERT_CATALOG)[number]["id"];

export function normalizeMuted(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(ALERT_CATALOG.map((c) => c.id));
  return raw
    .filter((x): x is string => typeof x === "string" && allowed.has(x))
    .slice(0, 32);
}

export function isAlertMuted(
  muted: string[] | undefined,
  key: string
): boolean {
  if (!muted?.length) return false;
  const base = key.includes(":") ? key.split(":")[0]! : key;
  if (base === "bridge.online") return muted.includes("bridge.offline");
  if (base === "node.online") return muted.includes("node.unreachable");
  return muted.includes(base);
}
