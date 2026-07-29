"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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
  /** True while search is focused / open — parent can hide Boom/Refresh */
  onActiveChange?: (active: boolean) => void;
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
      return { color: "#10B981", label: "Live" };
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
  onActiveChange,
}: NodeMapSearchProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  /** Telegram: pin bar to top of visual viewport while keyboard open */
  const [tgPinned, setTgPinned] = useState(false);
  const lastClearToken = useRef(clearToken);
  const spacerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  const isTgMiniApp = useCallback(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("tg-miniapp");
  }, []);

  /** Space left below search bar inside visual viewport (above keyboard). */
  const remainingListHeight = useCallback((barBottom: number) => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const vvTop = vv?.offsetTop ?? 0;
    const vvH = vv?.height ?? (typeof window !== "undefined" ? window.innerHeight : 600);
    const vvBottom = vvTop + vvH;
    // Keep list fully above keyboard / viewport bottom
    return Math.max(140, Math.min(560, vvBottom - barBottom - 12));
  }, []);

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
  const searchActive = focused || showPanel;

  useEffect(() => {
    onActiveChange?.(searchActive);
  }, [searchActive, onActiveChange]);

  useEffect(() => {
    setActiveIdx(0);
  }, [trimmed]);

  // Panel geometry under the search field; maxHeight stays above keyboard
  const updatePanelPos = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 10;
    const maxW =
      typeof window !== "undefined"
        ? Math.min(window.innerWidth - pad * 2, 420)
        : 420;
    const top = r.bottom + 6;
    setPanelPos({
      top,
      left: Math.max(
        pad,
        Math.min(r.left, (window.innerWidth || 0) - maxW - pad)
      ),
      width: Math.min(Math.max(r.width, compact ? 280 : 300), maxW),
      maxHeight: remainingListHeight(top),
    });
  }, [compact, remainingListHeight]);

  /** Scroll + pin search when TG keyboard opens (list stays attached to bar). */
  const pinSearchToTopTg = useCallback(() => {
    if (!isTgMiniApp()) return;
    const el = rootRef.current;
    if (!el) return;

    try {
      const rect = el.getBoundingClientRect();
      const y = window.scrollY + rect.top - 8;
      window.scrollTo({ top: Math.max(0, y), behavior: "auto" });
    } catch {
      el.scrollIntoView({ block: "start", behavior: "auto" });
    }

    setTgPinned(true);
    requestAnimationFrame(() => updatePanelPos());
  }, [isTgMiniApp, updatePanelPos]);

  useLayoutEffect(() => {
    if (!tgPinned || !isTgMiniApp()) return;
    const el = rootRef.current;
    if (!el) return;

    const applyPin = () => {
      const vv = window.visualViewport;
      const barH = el.offsetHeight || 44;
      // ~2 bar heights below visual top (TG chrome)
      const top = (vv?.offsetTop ?? 0) + barH * 2;
      const left = 10;
      const width = Math.max(200, (vv?.width ?? window.innerWidth) - 20);
      el.style.position = "fixed";
      el.style.top = `${top}px`;
      el.style.left = `${left}px`;
      el.style.right = "auto";
      el.style.width = `${width}px`;
      el.style.zIndex = "13000";
      el.style.margin = "0";
      if (spacerRef.current) {
        spacerRef.current.style.height = `${barH}px`;
      }
      updatePanelPos();
    };

    applyPin();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", applyPin);
    vv?.addEventListener("scroll", applyPin);
    window.addEventListener("resize", applyPin);
    return () => {
      vv?.removeEventListener("resize", applyPin);
      vv?.removeEventListener("scroll", applyPin);
      window.removeEventListener("resize", applyPin);
    };
  }, [tgPinned, isTgMiniApp, updatePanelPos, showPanel, query]);

  // Unpin when focus ends
  useEffect(() => {
    if (focused || showPanel) return;
    if (!tgPinned) return;
    setTgPinned(false);
    const el = rootRef.current;
    if (el) {
      el.style.position = "";
      el.style.top = "";
      el.style.left = "";
      el.style.right = "";
      el.style.width = "";
      el.style.zIndex = "";
      el.style.margin = "";
    }
    if (spacerRef.current) spacerRef.current.style.height = "0px";
  }, [focused, showPanel, tgPinned]);

  useLayoutEffect(() => {
    if (!showPanel && !tgPinned) return;
    updatePanelPos();
    const onScroll = () => updatePanelPos();
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    window.visualViewport?.addEventListener("resize", onScroll);
    window.visualViewport?.addEventListener("scroll", onScroll);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
      window.visualViewport?.removeEventListener("resize", onScroll);
      window.visualViewport?.removeEventListener("scroll", onScroll);
    };
  }, [showPanel, updatePanelPos, results.length, query, tgPinned, focused]);

  // Keep active row visible inside list only (do not scroll the page)
  useEffect(() => {
    if (!showPanel || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${activeIdx}"]`
    );
    if (!el || !listRef.current) return;
    const parent = listRef.current;
    const pTop = parent.scrollTop;
    const pBottom = pTop + parent.clientHeight;
    const eTop = el.offsetTop;
    const eBottom = eTop + el.offsetHeight;
    if (eTop < pTop) parent.scrollTop = eTop;
    else if (eBottom > pBottom) parent.scrollTop = eBottom - parent.clientHeight;
  }, [activeIdx, showPanel, results.length]);

  // Outside click closes list (keeps query) — include portaled panel
  useEffect(() => {
    if (!open && !focused) return;
    const onDown = (e: Event) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      const panel = document.getElementById(listId);
      if (panel?.contains(t)) return;
      setOpen(false);
      setFocused(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open, focused, listId]);

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
    <>
      {/* Holds vertical space when search is fixed in TG keyboard mode */}
      <div
        ref={spacerRef}
        className="w-full pointer-events-none"
        style={{ height: 0 }}
        aria-hidden
      />
    <div
      ref={rootRef}
      className={`relative pointer-events-auto ${className} ${
        tgPinned ? "lumen-tg-search-pinned" : ""
      }`}
      role="search"
    >
      <div
        className={`
          group relative flex items-center gap-2 rounded-2xl border border-white/10
          bg-[#0A0A0F]/92 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)]
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
        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setFocused(true);
              if (isTgMiniApp()) setTgPinned(true);
            }}
            onFocus={() => {
              setOpen(true);
              setFocused(true);
              if (isTgMiniApp()) {
                // Defer until keyboard starts animating
                pinSearchToTopTg();
                window.setTimeout(pinSearchToTopTg, 50);
                window.setTimeout(pinSearchToTopTg, 280);
              }
            }}
            onBlur={() => {
              // delay so option click can fire first
              window.setTimeout(() => {
                if (!listRef.current?.contains(document.activeElement)) {
                  setFocused(false);
                }
              }, 120);
            }}
            onKeyDown={onKeyDown}
            placeholder=""
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-label="search name, IP"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              showPanel && results[activeIdx]
                ? `${listId}-opt-${activeIdx}`
                : undefined
            }
            className="lumen-search-input w-full min-w-0 bg-transparent outline-none border-0 text-[#E8E8F0] font-mono tracking-wide"
          />
          {/* Custom placeholder: "search name, IP," + blinking _ */}
          {!query && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center font-mono tracking-wide text-[#A0A0B0]/55"
            >
              search name, IP,
              <span className="lumen-search-caret ml-0.5 text-[#A0A0B0]/75">
                _
              </span>
            </span>
          )}
        </div>
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

      {/*
        Results list:
        - TG pinned (keyboard): attach under fixed bar so it never flies off-screen
        - else: fixed portal (escapes map overflow)
      */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={
              tgPinned
                ? {
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: 6,
                    zIndex: 2,
                    maxHeight: panelPos?.maxHeight ?? 280,
                  }
                : mounted && panelPos
                  ? {
                      position: "fixed",
                      top: panelPos.top,
                      left: panelPos.left,
                      width: panelPos.width,
                      maxWidth: "min(100vw - 16px, 420px)",
                      zIndex: 13050,
                      maxHeight: panelPos.maxHeight,
                    }
                  : {
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      marginTop: 6,
                      zIndex: 50,
                      maxHeight: 320,
                    }
            }
            className="pointer-events-auto overflow-hidden rounded-2xl border border-white/12 bg-[#0A0A0F]/97 backdrop-blur-xl shadow-[0_20px_56px_rgba(0,0,0,0.65)]"
          >
            <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between shrink-0">
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
              <div className="px-4 py-6 text-center">
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
                className="overflow-y-auto overscroll-contain lumen-search-scroll pb-1.5"
                style={{
                  maxHeight: Math.max(
                    100,
                    (panelPos?.maxHeight ?? 280) - 36
                  ),
                }}
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
                      onMouseDown={(e) => e.preventDefault()}
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
    </>
  );
}
