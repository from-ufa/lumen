"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";

export type SearchableNode = {
  id: string;
  ip: string;
  port?: string | null;
  name: string;
  country?: string;
  city?: string;
  state?: string | null;
  version?: string | null;
  lat: number;
  lon: number;
};

type NodeMapSearchProps = {
  nodes: SearchableNode[];
  onSelect: (node: SearchableNode) => void;
  selectedId?: string | null;
  /** Compact strip for mobile */
  compact?: boolean;
  className?: string;
  /**
   * Increment to fully clear query + close results (e.g. parent Clear).
   * Value 0 / undefined = no-op on mount.
   */
  clearToken?: number;
};

function normalizeState(s?: string | null): string {
  if (s === "reachable") return "live";
  if (s === "stale") return "seen";
  return s || "seen";
}

function stateStyle(state: string): { color: string; label: string } {
  switch (state) {
    case "connected":
      return { color: "#00E5FF", label: "Connected" };
    case "live":
      return { color: "#38BDF8", label: "Live" };
    case "seen":
      return { color: "#A8B4C8", label: "Seen" };
    default:
      return { color: "#C45C5C", label: "Ghost" };
  }
}

/** Shorten long Ergo SNAPSHOT versions for UI */
export function shortVersion(v?: string | null): string | null {
  if (!v) return null;
  const m = v.match(/^(\d+\.\d+\.\d+)/);
  if (m) {
    const rest = v.slice(m[1].length);
    if (rest.includes("SNAPSHOT") || rest.length > 8) return m[1];
    return v.length > 18 ? m[1] : v;
  }
  return v.length > 18 ? `${v.slice(0, 16)}…` : v;
}

function scoreMatch(node: SearchableNode, q: string): number {
  const name = (node.name || "").toLowerCase();
  const ip = (node.ip || "").toLowerCase();
  const country = (node.country || "").toLowerCase();
  const city = (node.city || "").toLowerCase();
  const version = (node.version || "").toLowerCase();
  const shortV = (shortVersion(node.version) || "").toLowerCase();
  const port = (node.port || "").toLowerCase();
  const hay = `${name} ${ip} ${country} ${city} ${version} ${shortV} ${port}`;

  if (!q) return 0;
  if (ip === q || ip.startsWith(q)) return 100;
  if (name === q) return 95;
  if (name.startsWith(q)) return 90;
  if (country === q || country.startsWith(q)) return 80;
  if (city.startsWith(q)) return 75;
  if (shortV === q || version.startsWith(q) || shortV.startsWith(q)) return 70;
  if (name.includes(q)) return 60;
  if (ip.includes(q)) return 55;
  if (country.includes(q) || city.includes(q)) return 50;
  if (version.includes(q) || shortV.includes(q)) return 45;
  if (hay.includes(q)) return 30;
  // multi-token: all tokens must match somewhere
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => hay.includes(t))) return 40;
  return 0;
}

const MAX_RESULTS = 48;

export default function NodeMapSearch({
  nodes,
  onSelect,
  selectedId,
  compact = false,
  className = "",
  clearToken = 0,
}: NodeMapSearchProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const lastClearToken = useRef(clearToken);

  /** Parent-driven full clear (input + dropdown) */
  useEffect(() => {
    if (!clearToken || clearToken === lastClearToken.current) return;
    lastClearToken.current = clearToken;
    setQuery("");
    setOpen(false);
    setActiveIdx(0);
  }, [clearToken]);

  const trimmed = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!trimmed) return [];
    const scored: { node: SearchableNode; score: number }[] = [];
    for (const n of nodes) {
      const score = scoreMatch(n, trimmed);
      if (score > 0) scored.push({ node: n, score });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Connected / Live first on ties
      const rank = (s?: string | null) => {
        const x = normalizeState(s);
        if (x === "connected") return 0;
        if (x === "live") return 1;
        if (x === "seen") return 2;
        return 3;
      };
      const rd = rank(a.node.state) - rank(b.node.state);
      if (rd !== 0) return rd;
      return (a.node.name || a.node.ip).localeCompare(b.node.name || b.node.ip);
    });
    return scored.slice(0, MAX_RESULTS).map((s) => s.node);
  }, [nodes, trimmed]);

  const showPanel = open && trimmed.length > 0;

  useEffect(() => {
    setActiveIdx(0);
  }, [trimmed]);

  // Keep active row visible
  useEffect(() => {
    if (!showPanel || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${activeIdx}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, showPanel, results.length]);

  // Outside click closes list (keeps query)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = useCallback(
    (node: SearchableNode) => {
      onSelect(node);
      setOpen(false);
      inputRef.current?.blur();
    },
    [onSelect]
  );

  const clear = useCallback(() => {
    setQuery("");
    setOpen(false);
    setActiveIdx(0);
    inputRef.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (showPanel) {
        setOpen(false);
      } else if (query) {
        clear();
      } else {
        inputRef.current?.blur();
      }
      return;
    }

    if (!trimmed) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) =>
        results.length ? Math.min(i + 1, results.length - 1) : 0
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (results[activeIdx]) pick(results[activeIdx]);
      return;
    }
    if (e.key === "Home" && showPanel) {
      e.preventDefault();
      setActiveIdx(0);
    }
    if (e.key === "End" && showPanel) {
      e.preventDefault();
      setActiveIdx(Math.max(0, results.length - 1));
    }
  };

  return (
    <div
      ref={rootRef}
      className={`relative pointer-events-auto ${className}`}
      role="search"
    >
      <div
        className={`
          group relative flex items-center gap-2 rounded-2xl border border-white/10
          bg-[#0A0A0F]/88 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)]
          transition-all duration-300
          focus-within:border-[#00E5FF]/35 focus-within:shadow-[0_8px_40px_rgba(0,229,255,0.08)]
          ${compact ? "px-3 py-2" : "px-3.5 py-2.5"}
        `}
      >
        <Search
          className={`shrink-0 text-[#A0A0B0] group-focus-within:text-[#00E5FF]/80 transition-colors ${
            compact ? "w-3.5 h-3.5" : "w-4 h-4"
          }`}
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search name, IP, country, version…"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showPanel && results[activeIdx]
              ? `${listId}-opt-${activeIdx}`
              : undefined
          }
          className={`
            flex-1 min-w-0 bg-transparent outline-none border-0
            text-[#E8E8F0] placeholder:text-[#A0A0B0]/55
            font-mono tracking-wide
            ${compact ? "text-[11px]" : "text-[12px]"}
          `}
        />
        <AnimatePresence>
          {query ? (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.15 }}
              onClick={clear}
              className="shrink-0 p-1 rounded-lg text-[#A0A0B0] hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-full left-0 right-0 mt-2 z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0F]/94 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
          >
            <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between">
              <span className="text-[9px] font-mono tracking-[0.2em] text-[#A0A0B0]/80">
                {results.length > 0
                  ? `${results.length}${results.length >= MAX_RESULTS ? "+" : ""} MATCHES`
                  : "RESULTS"}
              </span>
              <span className="text-[9px] font-mono text-[#A0A0B0]/45 hidden sm:inline">
                ↑↓ · Enter · Esc
              </span>
            </div>

            {results.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="text-[12px] text-[#E8E8F0]/90 font-medium">
                  No nodes found
                </div>
                <div className="mt-1 text-[10px] font-mono text-[#A0A0B0]/70">
                  Try name, IP, country code, or version
                </div>
              </div>
            ) : (
              <div
                ref={listRef}
                className="max-h-[min(340px,42vh)] overflow-y-auto overscroll-contain lumen-search-scroll pb-1.5"
              >
                {results.map((n, idx) => {
                  const st = normalizeState(n.state);
                  const meta = stateStyle(st);
                  const active = idx === activeIdx;
                  const selected = selectedId === n.id;
                  const ver = shortVersion(n.version);
                  const loc = [n.city, n.country].filter(Boolean).join(", ");

                  return (
                    <button
                      key={n.id}
                      type="button"
                      id={`${listId}-opt-${idx}`}
                      data-idx={idx}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => pick(n)}
                      className={`
                        w-full text-left px-3 py-2.5 mx-0 flex gap-2.5 items-start
                        transition-colors duration-150
                        ${active || selected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}
                        ${selected ? "ring-1 ring-inset ring-[#00E5FF]/20" : ""}
                      `}
                    >
                      <span
                        className="mt-1.5 w-2 h-2 rounded-full shrink-0 shadow-[0_0_8px_currentColor]"
                        style={{
                          background: meta.color,
                          color: meta.color,
                          opacity: st === "seen" ? 0.7 : 1,
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-[12px] font-medium text-white truncate">
                            {n.name || "unknown"}
                          </span>
                          <span
                            className="shrink-0 text-[9px] font-mono tracking-wider uppercase"
                            style={{ color: meta.color }}
                          >
                            {meta.label}
                          </span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-[#A0A0B0]">
                          <span className="text-[#E8E8F0]/75">
                            {n.ip}
                            {n.port ? `:${n.port}` : ""}
                          </span>
                          {loc ? <span>· {loc}</span> : null}
                          {ver ? (
                            <span className="text-[#00E5FF]/70">v{ver}</span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
