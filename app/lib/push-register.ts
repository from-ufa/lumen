/**
 * Push Notifications — Phase 1 client.
 * Registers device token only inside Capacitor native shell.
 * Browser: silent no-op (no console noise).
 */

import { isNativeCapacitor } from "./capacitor-native";

export type PushRegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

/**
 * Request permission, register with APNs/FCM via Capacitor, POST token to hub.
 * Safe to call from web — returns early when not native.
 */
export async function registerPushIfNative(): Promise<PushRegisterResult> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "ssr" };
  }

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      return { ok: false, reason: "not_native" };
    }

    const { PushNotifications } = await import(
      "@capacitor/push-notifications"
    );

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      return { ok: false, reason: "permission_denied" };
    }

    await PushNotifications.register();

    const token = await new Promise<string>((resolve, reject) => {
      const t = window.setTimeout(
        () => reject(new Error("token_timeout")),
        15_000
      );
      PushNotifications.addListener("registration", (ev) => {
        window.clearTimeout(t);
        resolve(ev.value);
      });
      PushNotifications.addListener("registrationError", (err) => {
        window.clearTimeout(t);
        reject(err);
      });
    });

    if (!token || typeof token !== "string" || token.length < 16) {
      return { ok: false, reason: "invalid_token" };
    }

    const res = await fetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        token,
        platform: Capacitor.getPlatform(),
        appId: "net.ergolumen.app",
      }),
    });

    if (!res.ok) {
      return { ok: false, reason: `hub_${res.status}` };
    }

    return { ok: true, token: `${token.slice(0, 8)}…` };
  } catch {
    // Never throw / spam browser console
    return { ok: false, reason: "native_unavailable" };
  }
}

/** Alias for clarity in app shell */
export function shouldAttemptPush(): boolean {
  return isNativeCapacitor();
}
