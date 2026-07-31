"use client";

import type { ReactNode } from "react";
import MiniCard from "./MiniCard";

/**
 * Soft empty / error block for Mini App lists & panels.
 */
export default function EmptyState({
  title,
  body,
  icon,
  onClick,
  actionLabel,
}: {
  title: string;
  body?: string;
  icon?: ReactNode;
  onClick?: () => void;
  actionLabel?: string;
}) {
  return (
    <MiniCard onClick={onClick}>
      <div className="flex gap-3 items-start">
        {icon ? (
          <div className="shrink-0 w-9 h-9 rounded-xl border border-white/10 bg-white/[0.04] flex items-center justify-center text-[#A0A0B0]">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[#E8E8F0] font-medium leading-snug">
            {title}
          </p>
          {body ? (
            <p className="text-[11px] text-[#A0A0B0] mt-1 leading-relaxed">
              {body}
            </p>
          ) : null}
          {onClick && actionLabel ? (
            <p className="mt-2 text-[10px] font-mono tracking-wider text-[#FF7A3D]">
              {actionLabel} ›
            </p>
          ) : null}
        </div>
      </div>
    </MiniCard>
  );
}
