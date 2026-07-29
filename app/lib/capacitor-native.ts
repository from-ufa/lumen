/**
 * Capacitor native helpers — safe in browser (no-ops / silent).
 * Phase 1: status bar dark + push register stub only when native.
 */

export function isNativeCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Dynamic require avoided — check Capacitor global when plugin loads
    const Cap = (
      window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean };
      }
    ).Capacitor;
    return !!Cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/** Dark status bar + splash hide — only on native iOS/Android shell */
export async function initNativeShell(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    try {
      await StatusBar.setBackgroundColor({ color: "#0A0A0F" });
    } catch {
      /* iOS may ignore backgroundColor */
    }

    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide().catch(() => {});
  } catch {
    /* browser / missing plugins — silent */
  }
}
