import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "lumen · Mini App",
  description: "Lumen operator app for Telegram",
  applicationName: "lumen",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0F",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * Mini App root — isolated from web hero/Orbit chrome.
 * Served at /m and rewritten from m.ergolumen.net
 */
export default function MiniAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="mini-app-root min-h-dvh bg-[#0A0A0F] text-[#E8E8F0] antialiased"
      /* Hide legacy web TG pill if it still mounts */
      data-mini-shell="1"
    >
      {children}
    </div>
  );
}
