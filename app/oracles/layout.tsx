import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Oracles · Lumen",
  description:
    "Ergo Oracle Pools — dual Constellation for ERG/USD and ERG/XAU (live on-chain data)",
};

export default function OraclesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
