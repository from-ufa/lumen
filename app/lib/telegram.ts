/**
 * Telegram Mini App helpers — silent no-op outside Telegram WebView.
 * Client-only (window). Safe to import from client components.
 */

import type {
  TelegramHapticImpactStyle,
  TelegramHapticNotification,
  TelegramWebApp,
} from "./telegram-types";

const LUMEN_BG = "#0A0A0F";
const LUMEN_HEADER = "#0A0A0F";
const LUMEN_ACCENT = "#FF7A3D";

export type TgStartView = "orbit" | "map" | "oracles" | "settings";

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  try {
    return window.Telegram?.WebApp ?? null;
  } catch {
    return null;
  }
}

/** True when running inside Telegram Mini App WebView with a real WebApp object. */
export function isTelegramMiniApp(): boolean {
  const wa = getWebApp();
  if (!wa) return false;
  // initData empty in some desktop TG debug cases — still treat as TG if platform set
  return Boolean(wa.initData || wa.platform);
}

export function isTelegramPlatform(): boolean {
  const wa = getWebApp();
  if (!wa?.platform) return false;
  return wa.platform !== "unknown";
}

/** Coarse low-end hint for TG Android / weak WebViews */
export function isTelegramLowEnd(): boolean {
  if (!isTelegramMiniApp()) return false;
  const wa = getWebApp();
  const platform = (wa?.platform || "").toLowerCase();
  if (typeof navigator !== "undefined") {
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof mem === "number" && mem > 0 && mem <= 2) return true;
    const cores = navigator.hardwareConcurrency;
    if (typeof cores === "number" && cores > 0 && cores <= 4 && platform === "android") {
      return true;
    }
  }
  // Android TG WebView is the usual risk surface
  return platform === "android";
}

export function getStartParam(): string | null {
  const wa = getWebApp();
  const raw =
    wa?.initDataUnsafe?.start_param ||
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tgWebAppStartParam")
      : null);
  if (!raw) return null;
  return String(raw).trim().toLowerCase() || null;
}

export function parseStartView(param: string | null): TgStartView | null {
  if (!param) return null;
  const p = param.toLowerCase();
  if (p === "orbit" || p === "constellation" || p === "3d") return "orbit";
  if (p === "map" || p === "world") return "map";
  if (p === "oracles" || p === "oracle") return "oracles";
  if (p === "settings" || p === "connect") return "settings";
  return null;
}

function applyThemeCss(wa: TelegramWebApp) {
  try {
    const root = document.documentElement;
    root.classList.add("tg-miniapp");
    root.dataset.tgPlatform = wa.platform || "";
    // Keep Lumen dark language; optionally pull link/button accents
    const tp = wa.themeParams || {};
    if (tp.button_color) {
      root.style.setProperty("--tg-button", tp.button_color);
    }
    if (tp.link_color) {
      root.style.setProperty("--tg-link", tp.link_color);
    }
    // Prefer Telegram content safe area when exposed via CSS env (modern clients)
    // Fallback: use viewportStableHeight for --tg-vh
    if (wa.viewportStableHeight) {
      root.style.setProperty("--tg-vh", `${wa.viewportStableHeight}px`);
    }
  } catch {
    /* ignore */
  }
}

function safeCall(fn: () => void) {
  try {
    fn();
  } catch {
    /* older clients */
  }
}

/**
 * Bootstrap Mini App chrome. Call once from client Providers.
 * No-op outside Telegram.
 */
export function initTelegramApp(): void {
  if (typeof window === "undefined") return;
  const wa = getWebApp();
  if (!wa) return;

  safeCall(() => wa.ready());
  safeCall(() => wa.expand());
  safeCall(() => wa.setHeaderColor(LUMEN_HEADER));
  safeCall(() => wa.setBackgroundColor(LUMEN_BG));
  safeCall(() => wa.setBottomBarColor?.(LUMEN_BG));
  // Fullscreen when supported (Bot API 8+)
  safeCall(() => wa.requestFullscreen?.());

  applyThemeCss(wa);

  if (isTelegramLowEnd()) {
    document.documentElement.classList.add("tg-low-end");
    document.documentElement.dataset.tgLowEnd = "1";
  }

  // Pause heavy work when Mini App hidden
  const onVis = () => {
    const hidden = document.visibilityState === "hidden";
    document.documentElement.dataset.tgHidden = hidden ? "1" : "0";
    window.dispatchEvent(
      new CustomEvent("lumen:tg-visibility", { detail: { hidden } })
    );
  };
  document.addEventListener("visibilitychange", onVis);

  safeCall(() => {
    wa.onEvent("viewportChanged", () => applyThemeCss(wa));
  });
}

/** Disable vertical swipe-to-close — use on Orbit / map viz */
export function setTelegramVerticalSwipes(enabled: boolean): void {
  const wa = getWebApp();
  if (!wa) return;
  if (enabled) safeCall(() => wa.enableVerticalSwipes?.());
  else safeCall(() => wa.disableVerticalSwipes?.());
}

export function hapticImpact(style: TelegramHapticImpactStyle = "light"): void {
  if (!isTelegramMiniApp()) return;
  safeCall(() => getWebApp()?.HapticFeedback?.impactOccurred(style));
}

export function hapticNotification(
  type: TelegramHapticNotification = "success"
): void {
  if (!isTelegramMiniApp()) return;
  safeCall(() => getWebApp()?.HapticFeedback?.notificationOccurred(type));
}

export function hapticSelection(): void {
  if (!isTelegramMiniApp()) return;
  safeCall(() => getWebApp()?.HapticFeedback?.selectionChanged());
}

export function showTelegramConfirm(
  message: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const wa = getWebApp();
    if (!wa?.showConfirm) {
      resolve(window.confirm(message));
      return;
    }
    try {
      wa.showConfirm(message, (ok) => resolve(!!ok));
    } catch {
      resolve(window.confirm(message));
    }
  });
}

/** POST initData for server HMAC validation; sets session cookie when ok. */
export async function authenticateTelegramSession(): Promise<{
  ok: boolean;
  disabled?: boolean;
  userId?: number;
}> {
  if (!isTelegramMiniApp()) return { ok: false };
  const wa = getWebApp();
  const initData = wa?.initData;
  if (!initData) return { ok: false };
  try {
    const res = await fetch("/api/tg/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ initData }),
    });
    if (res.status === 503) {
      const j = (await res.json().catch(() => ({}))) as { disabled?: boolean };
      return { ok: false, disabled: j.disabled ?? true };
    }
    if (!res.ok) return { ok: false };
    const j = (await res.json()) as { ok?: boolean; userId?: number };
    return { ok: !!j.ok, userId: j.userId };
  } catch {
    return { ok: false };
  }
}

export function setupMainButton(opts: {
  text: string;
  onClick: () => void;
  visible?: boolean;
}): () => void {
  const wa = getWebApp();
  if (!wa?.MainButton) return () => {};
  const { text, onClick, visible = true } = opts;
  const handler = () => {
    hapticImpact("medium");
    onClick();
  };
  try {
    wa.MainButton.setParams({
      text,
      color: LUMEN_ACCENT,
      text_color: "#0A0A0F",
      is_active: true,
      is_visible: visible,
    });
    wa.MainButton.onClick(handler);
    if (visible) wa.MainButton.show();
  } catch {
    /* ignore */
  }
  return () => {
    try {
      wa.MainButton.offClick(handler);
      wa.MainButton.hide();
    } catch {
      /* ignore */
    }
  };
}

export function setupBackButton(onClick: () => void): () => void {
  const wa = getWebApp();
  if (!wa?.BackButton) return () => {};
  const handler = () => {
    hapticImpact("light");
    onClick();
  };
  try {
    wa.BackButton.onClick(handler);
    wa.BackButton.show();
  } catch {
    /* ignore */
  }
  return () => {
    try {
      wa.BackButton.offClick(handler);
      wa.BackButton.hide();
    } catch {
      /* ignore */
    }
  };
}

export { LUMEN_BG, LUMEN_HEADER, LUMEN_ACCENT };
