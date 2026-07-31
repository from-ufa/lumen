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
import { hydrateSettingsFromTelegramVault } from "../lib/node-api";

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
    void (async () => {
      await authenticateTelegramSession();
      // TS-1: vault hydrate (force after /link even if stale local token)
      const h = await hydrateSettingsFromTelegramVault();
      if (h.applied || h.reason === "already_synced") {
        try {
          window.dispatchEvent(
            new CustomEvent("lumen:settings-hydrated", {
              detail: {
                tokenFp: h.tokenFp,
                tokenTail: h.tokenTail,
                applied: h.applied,
              },
            })
          );
        } catch {
          /* */
        }
      }
    })();
    try {
      getWebApp()?.MainButton?.hide();
    } catch {
      /* */
    }
  }, []);

  // Deep link start_param once (web only — Mini App shell handles tabs itself)
  useEffect(() => {
    if (deepLinkDone.current) return;
    if (!isTelegramMiniApp()) return;
    // m.ergolumen.net / /m — MiniAppShell owns start_param → tabs
    try {
      const host = window.location.hostname.toLowerCase();
      if (
        host === "m.ergolumen.net" ||
        host.startsWith("m.") ||
        pathname === "/m" ||
        pathname?.startsWith("/m/")
      ) {
        deepLinkDone.current = true;
        return;
      }
    } catch {
      /* */
    }
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
  }, [router, pathname]);

  // Vertical swipes: disable on heavy touch UIs + Mini App shell
  useEffect(() => {
    if (!isTelegramMiniApp()) return;
    const heavy =
      pathname === "/" ||
      pathname === "/oracles" ||
      pathname?.startsWith("/oracles") ||
      pathname === "/m" ||
      pathname?.startsWith("/m/");
    setTelegramVerticalSwipes(!heavy);
    return () => setTelegramVerticalSwipes(true);
  }, [pathname]);

  // Low-end: prefer Map once on first *web* dashboard entry (not Mini App)
  useEffect(() => {
    if (!isTelegramMiniApp() || !isTelegramLowEnd()) return;
    if (pathname !== "/") return;
    try {
      if (window.location.hostname.toLowerCase() === "m.ergolumen.net") return;
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
