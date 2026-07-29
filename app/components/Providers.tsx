"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { initNativeShell } from "../lib/capacitor-native";
import { registerPushIfNative } from "../lib/push-register";
import TelegramBootstrap from "./TelegramBootstrap";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Short stale window so mode switches (Lumen ↔ My Node) never linger
            staleTime: 1_000,
            gcTime: 30_000,
            refetchInterval: 8_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Capacitor shell only — no-ops in browser
  useEffect(() => {
    void initNativeShell().then(() => {
      void registerPushIfNative();
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TelegramBootstrap />
      {children}
    </QueryClientProvider>
  );
}
