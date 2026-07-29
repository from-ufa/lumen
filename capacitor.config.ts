import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Lumen iOS shell — Phase 1
 *
 * server.url points at the live production site so the native WebView
 * has full parity with https://ergolumen.net (Orbit, Map, Oracles, Bridge UI).
 *
 * Phase 2 (Store-ready): build static/export or bundled webDir from Next,
 * drop server.url for offline-capable shell, proper signing + APNs.
 */
const config: CapacitorConfig = {
  appId: "net.ergolumen.app",
  appName: "Lumen",
  // Placeholder local dir for `cap sync` (Phase 1 primary content = server.url)
  webDir: "native-shell",
  server: {
    // Phase 1: shell over live site (dev/test). Phase 2: package web assets.
    url: "https://ergolumen.net",
    cleartext: false,
    allowNavigation: ["ergolumen.net", "www.ergolumen.net", "*.ergolumen.net"],
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    backgroundColor: "#0A0A0F",
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0A0A0F",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0A0A0F",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
