"use client";

/**
 * Shared premium header chrome — identical size/typography/ovals on
 * Node dashboard and Oracles (one product language).
 */

import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes } from "react";

export type HeaderPillTone =
  | "live"
  | "offline"
  | "warn"
  | "cyan"
  | "gold"
  | "neutral"
  | "glass"
  | "accent";

const TONE: Record<
  HeaderPillTone,
  { wrap: string; dot?: string }
> = {
  live: {
    wrap: "border-[#10B981]/35 bg-[#10B981]/[0.09] text-[#10B981] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    dot: "bg-[#10B981] status-dot",
  },
  offline: {
    wrap: "border-[#EF4444]/35 bg-[#EF4444]/[0.09] text-[#EF4444] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
    dot: "bg-[#EF4444]",
  },
  warn: {
    wrap: "border-[#F59E0B]/35 bg-[#F59E0B]/[0.1] text-[#F59E0B] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    dot: "bg-[#F59E0B]",
  },
  cyan: {
    wrap: "border-[#00E5FF]/35 bg-[#00E5FF]/[0.1] text-[#00E5FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    dot: "bg-[#00E5FF] status-dot",
  },
  gold: {
    wrap: "border-[#E8C547]/35 bg-[#E8C547]/[0.1] text-[#E8C547] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
  },
  neutral: {
    wrap: "border-white/[0.12] bg-white/[0.04] text-[#C8C8D0] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
  },
  glass: {
    wrap: "border-white/10 bg-white/[0.04] text-[#E8E8F0] backdrop-blur-xl hover:border-white/25 hover:bg-white/[0.07]",
  },
  accent: {
    wrap: "border-[#FF7A3D]/40 bg-[#FF7A3D]/[0.12] text-[#FF7A3D] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-[#FF7A3D]/[0.18] hover:border-[#FF7A3D]/55",
  },
};

/** Shared pill shell — status, mode, nav, actions */
export function HeaderPill({
  tone = "neutral",
  children,
  title,
  showDot,
  className = "",
  as = "div",
  href,
  onClick,
  onMouseEnter,
  type = "button",
  disabled,
}: {
  tone?: HeaderPillTone;
  children: ReactNode;
  title?: string;
  /** Status-style live dot on the left */
  showDot?: boolean;
  className?: string;
  as?: "div" | "button" | "link";
  href?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  disabled?: boolean;
}) {
  const t = TONE[tone];
  const base =
    "lumen-header-pill inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full " +
    "text-[10px] font-mono font-medium tracking-[0.16em] uppercase " +
    "border transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] " +
    "select-none whitespace-nowrap " +
    t.wrap +
    (className ? ` ${className}` : "");

  const inner = (
    <>
      {showDot && t.dot ? (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} />
      ) : null}
      {children}
    </>
  );

  if (as === "link" && href) {
    return (
      <Link
        href={href}
        className={base}
        title={title}
        onMouseEnter={onMouseEnter}
        prefetch
      >
        {inner}
      </Link>
    );
  }
  if (as === "button") {
    return (
      <button
        type={type}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        disabled={disabled}
        className={`${base} disabled:opacity-40 active:scale-[0.98]`}
        title={title}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={base} title={title} onMouseEnter={onMouseEnter}>
      {inner}
    </div>
  );
}

/** Icon-only refresh / menu — same height as pills */
export function HeaderIconButton({
  children,
  onClick,
  title,
  active,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={
        "lumen-header-icon inline-flex items-center justify-center h-10 w-10 rounded-full " +
        "border border-white/10 bg-white/[0.04] text-[#E8E8F0] " +
        "hover:border-white/25 hover:bg-white/[0.07] " +
        "transition-all duration-200 active:scale-[0.97] " +
        (active
          ? "border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF] "
          : "") +
        className
      }
    >
      {children}
    </button>
  );
}

/** Right-side action cluster — same gap on node & oracle */
export function HeaderActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 justify-end">
      {children}
    </div>
  );
}
