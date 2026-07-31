"use client";

import type { ReactNode } from "react";

export default function MiniCard({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const base =
    "rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} w-full text-left lumen-ui-transition active:scale-[0.99] ${className}`}
      >
        {children}
      </button>
    );
  }
  return <div className={`${base} ${className}`}>{children}</div>;
}
