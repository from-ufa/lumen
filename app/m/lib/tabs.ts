export type MiniTabId = "home" | "network" | "oracles" | "me";

export const MINI_TABS: {
  id: MiniTabId;
  label: string;
  short: string;
}[] = [
  { id: "home", label: "Home", short: "Home" },
  { id: "network", label: "Network", short: "Net" },
  { id: "oracles", label: "Oracles", short: "Ora" },
  { id: "me", label: "Me", short: "Me" },
];

export function isMiniTabId(v: string | null | undefined): v is MiniTabId {
  return v === "home" || v === "network" || v === "oracles" || v === "me";
}

/** Map TG start_param / deep links → tab */
export function tabFromStartParam(param: string | null): MiniTabId {
  if (!param) return "home";
  const p = param.toLowerCase();
  if (p === "oracles" || p === "oracle") return "oracles";
  if (p === "map" || p === "world" || p === "network" || p === "peers")
    return "network";
  if (p === "settings" || p === "connect" || p === "me" || p === "alerts")
    return "me";
  if (p === "home" || p === "orbit" || p === "constellation") return "home";
  return "home";
}

export function openSheetFromStartParam(
  param: string | null
): "bridge" | "alerts" | null {
  if (!param) return null;
  const p = param.toLowerCase();
  if (p === "settings" || p === "connect") return "bridge";
  if (p === "alerts") return "alerts";
  return null;
}
