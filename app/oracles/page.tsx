import Link from "next/link";
import { Zap, ArrowLeft } from "lucide-react";
import OracleConstellation from "./components/OracleConstellation";

export const metadata = {
  title: "Oracles · Lumen",
  description: "Ergo Oracle Pools visualization — Oracle Constellation",
};

export default function OraclesPage() {
  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#05070A",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Minimal Lumen header */}
      <header
        style={{
          flexShrink: 0,
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(5,7,10,0.92)",
          backdropFilter: "blur(16px)",
          zIndex: 40,
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "#E8E8F0",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 12,
              background: "linear-gradient(135deg, #FF7A3D, #00E5FF)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Zap size={16} color="#000" />
          </div>
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: 18,
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              Lumen
            </div>
            <div
              style={{
                fontSize: 9,
                fontFamily: "ui-monospace, monospace",
                letterSpacing: "0.2em",
                color: "rgba(160,160,176,0.85)",
                marginTop: 2,
              }}
            >
              ORACLES
            </div>
          </div>
        </Link>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontFamily: "ui-monospace, monospace",
            letterSpacing: "0.15em",
            color: "rgba(160,160,176,0.9)",
            textDecoration: "none",
            padding: "8px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <ArrowLeft size={14} />
          DASHBOARD
        </Link>
      </header>

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <OracleConstellation />
      </div>
    </main>
  );
}
