"use client";

/**
 * Client bootstrap for Telegram Mini App:
 * init chrome, auth session, deep links, Orbit swipe guard,
 * soft floating "My Node" pill (not native full-width MainButton).
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  authenticateTelegramSession,
  getStartParam,
  getWebApp,
  hapticImpact,
  initTelegramApp,
  isTelegramLowEnd,
  isTelegramMiniApp,
  parseStartView,
  setTelegramVerticalSwipes,
} from "../lib/telegram";

export default function TelegramBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const deepLinkDone = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [inTg, setInTg] = useState(false);

  useEffect(() => setMounted(true), []);

  // Early ready() + theme; hide native MainButton (huge bar)
  useEffect(() => {
    initTelegramApp();
    if (!isTelegramMiniApp()) {
      setInTg(false);
      return;
    }
    setInTg(true);
    void authenticateTelegramSession();
    try {
      getWebApp()?.MainButton?.hide();
    } catch {
      /* */
    }
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

  // Keep native MainButton hidden (Telegram redraws it sometimes)
  useEffect(() => {
    if (!inTg) return;
    const hide = () => {
      try {
        getWebApp()?.MainButton?.hide();
      } catch {
        /* */
      }
    };
    hide();
    const id = window.setInterval(hide, 2000);
    return () => window.clearInterval(id);
  }, [inTg, pathname]);

  // Soft oval CTA: dashboard = My Node, oracles = My Oracle → connection modal
  const pill =
    inTg && pathname === "/"
      ? { label: "My Node", aria: "My Node — open connection settings" }
      : inTg && (pathname === "/oracles" || pathname?.startsWith("/oracles"))
        ? { label: "My Oracle", aria: "My Oracle — open connection settings" }
        : null;

  const openSettings = () => {
    hapticImpact("medium");
    window.dispatchEvent(new CustomEvent("lumen:tg-open-settings"));
  };

  return (
    <>
      {mounted &&
        pill &&
        createPortal(
          <button
            type="button"
            onClick={openSettings}
            aria-label={pill.aria}
            className="lumen-tg-connect-pill fixed left-1/2 z-[10020] -translate-x-1/2 pointer-events-auto
              px-5 py-2.5 rounded-full
              text-[11px] font-mono font-medium tracking-[0.14em] uppercase
              text-[#FFD4BE]/95
              border border-[#FF7A3D]/35
              bg-[#FF7A3D]/22 backdrop-blur-md
              shadow-[0_8px_28px_rgba(0,0,0,0.35),0_0_20px_rgba(255,122,61,0.12)]
              hover:bg-[#FF7A3D]/32 hover:border-[#FF7A3D]/50
              active:scale-[0.97] lumen-ui-transition
              select-none"
            style={{
              bottom:
                "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))",
            }}
          >
            {pill.label}
          </button>,
          document.body
        )}
    </>
  );
}
