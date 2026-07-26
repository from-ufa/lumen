"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import OracleConstellation from "./OracleConstellation";
import type { OraclesApiResponse } from "./types";

async function fetchOracles(): Promise<OraclesApiResponse> {
  const res = await fetch("/api/oracles", { cache: "no-store" });
  if (!res.ok) throw new Error(`oracles ${res.status}`);
  return res.json();
}

export default function OraclesDualView() {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["oracles-constellation"],
    queryFn: fetchOracles,
    refetchInterval: 20_000,
    staleTime: 8_000,
  });

  const feeds = data?.feeds ?? [];
  const usd = feeds.find((f) => f.id === "erg-usd") || feeds[0];
  const xau = feeds.find((f) => f.id === "erg-xau") || feeds[1];

  if (isLoading && !data) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          letterSpacing: "0.2em",
          color: "rgba(160,160,176,0.8)",
          background: "#05070A",
        }}
      >
        LOADING ORACLE POOLS…
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: "#05070A",
          color: "#EF4444",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <div style={{ letterSpacing: "0.15em", fontSize: 12 }}>
          ORACLE API UNAVAILABLE
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
            color: "#E8E8F0",
            fontSize: 11,
            letterSpacing: "0.12em",
            cursor: "pointer",
          }}
        >
          RETRY
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#05070A",
        minHeight: 0,
      }}
    >
      {/* status strip */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "8px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          fontFamily: "ui-monospace, monospace",
          fontSize: 10,
          letterSpacing: "0.12em",
          color: "rgba(160,160,176,0.85)",
        }}
      >
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span>
            TIP{" "}
            <span style={{ color: "#E8E8F0" }}>
              {data?.tipHeight?.toLocaleString() ?? "—"}
            </span>
          </span>
          <span>
            SOURCE{" "}
            <span style={{ color: "#00E5FF" }}>ON-CHAIN POOL · /api/oracles</span>
          </span>
          <span>AUTO 20s</span>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          title="Refresh oracle data"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            color: "#A0A0B0",
            cursor: "pointer",
          }}
        >
          <RefreshCw
            size={12}
            style={{
              animation: isFetching ? "spin 0.8s linear infinite" : "none",
            }}
          />
          SYNC
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* dual windows */}
      <div
        className="oracles-dual-grid"
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 0,
        }}
      >
        <style>{`
          @media (max-width: 900px) {
            .oracles-dual-grid {
              grid-template-columns: 1fr !important;
              grid-template-rows: 1fr 1fr;
            }
          }
        `}</style>

        {[usd, xau].filter(Boolean).map((feed, i) => (
          <div
            key={feed!.id}
            style={{
              position: "relative",
              minHeight: 0,
              borderRight:
                i === 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
              borderBottom: undefined,
            }}
          >
            {/* pane title */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                zIndex: 20,
                pointerEvents: "none",
                display: "flex",
                justifyContent: "center",
                paddingTop: 6,
              }}
            >
              <div
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  color: "rgba(232,232,240,0.45)",
                  background: "rgba(5,7,10,0.55)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 999,
                  padding: "4px 12px",
                }}
              >
                {feed!.pair}
                <span
                  style={{
                    marginLeft: 8,
                    color:
                      feed!.status === "live"
                        ? "#00D4AA"
                        : feed!.status === "stale"
                          ? "#FBBF24"
                          : "#EF4444",
                  }}
                >
                  {feed!.status.toUpperCase()}
                </span>
              </div>
            </div>
            <OracleConstellation feed={feed!} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
