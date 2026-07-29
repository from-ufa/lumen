"use client";

/**
 * Client bootstrap for Telegram Mini App:
 * init chrome, auth session, deep links, Orbit swipe guard, MainButton.
 */

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  authenticateTelegramSession,
  getStartParam,
  hapticImpact,
  initTelegramApp,
  isTelegramLowEnd,
  isTelegramMiniApp,
  parseStartView,
  setTelegramVerticalSwipes,
  setupMainButton,
} from "../lib/telegram";

export default function TelegramBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const deepLinkDone = useRef(false);

  // Early ready() + theme
  useEffect(() => {
    initTelegramApp();
    if (!isTelegramMiniApp()) return;
    void authenticateTelegramSession();
  }, []);

  // Deep link start_param once
  useEffect(() => {
    if (deepLinkDone.current) return;
    if (!isTelegramMiniApp()) return;
    const view = parseStartView(getStartParam());
    if (!view) return;
    deepLinkDone.current = true;
    if (view === "oracles") {
      router.replace("/oracles");
      return;
    }
    if (view === "settings") {
      router.replace("/?viz=constellation&tg=settings");
      window.dispatchEvent(new CustomEvent("lumen:tg-open-settings"));
      return;
    }
    if (view === "map") {
      router.replace("/?viz=map");
      return;
    }
    if (view === "orbit") {
      router.replace("/?viz=constellation");
    }
  }, [router]);

  // Vertical swipes: disable on dashboard viz / oracles (heavy touch UIs)
  useEffect(() => {
    if (!isTelegramMiniApp()) return;
    const heavy =
      pathname === "/" ||
      pathname === "/oracles" ||
      pathname?.startsWith("/oracles");
    setTelegramVerticalSwipes(!heavy);
    return () => setTelegramVerticalSwipes(true);
  }, [pathname]);

  // Low-end: prefer Map once on first dashboard entry
  useEffect(() => {
    if (!isTelegramMiniApp() || !isTelegramLowEnd()) return;
    if (pathname !== "/") return;
    try {
      const key = "lumen_tg_low_map_once";
      if (sessionStorage.getItem(key)) return;
      const hasViz = new URLSearchParams(window.location.search).get("viz");
      if (hasViz) return;
      sessionStorage.setItem(key, "1");
      router.replace("/?viz=map");
    } catch {
      /* */
    }
  }, [pathname, router]);

  // MainButton → Settings / Connect (dashboard only)
  useEffect(() => {
    if (!isTelegramMiniApp()) return;
    if (pathname !== "/") {
      return;
    }
    return setupMainButton({
      text: "My Node",
      onClick: () => {
        hapticImpact("medium");
        window.dispatchEvent(new CustomEvent("lumen:tg-open-settings"));
      },
    });
  }, [pathname]);

  return null;
}
