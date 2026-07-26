"use client";

import { useId } from "react";

/** Faceted crystal mark — used for Oracles nav (not lucide Gem). */

export default function CrystalIcon({
  className = "w-3.5 h-3.5",
  title,
}: {
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const body = `crystal-body-${uid}`;
  const top = `crystal-top-${uid}`;
  const core = `crystal-core-${uid}`;

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M12 2.2 L18.6 7.1 L16.9 17.4 L12 21.8 L7.1 17.4 L5.4 7.1 Z"
        fill={`url(#${body})`}
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
        opacity="0.95"
      />
      <path
        d="M12 2.2 L8.4 7.4 H15.6 Z"
        fill={`url(#${top})`}
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <path
        d="M12 2.2 V21.8 M5.4 7.1 L12 9.6 L18.6 7.1 M7.1 17.4 L12 9.6 L16.9 17.4"
        stroke="currentColor"
        strokeWidth="0.85"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <path
        d="M10.2 8.8 L12 6.6 L13.8 8.8 L12 14.2 Z"
        fill={`url(#${core})`}
        opacity="0.85"
      />
      <defs>
        <linearGradient id={body} x1="6" y1="3" x2="18" y2="21">
          <stop offset="0%" stopColor="#F5E6A8" stopOpacity="0.35" />
          <stop offset="45%" stopColor="#A8EFFF" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#FF7A3D" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id={top} x1="12" y1="2" x2="12" y2="8">
          <stop offset="0%" stopColor="#FFF8D6" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#E8C547" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id={core} x1="12" y1="6" x2="12" y2="14">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#A8EFFF" stopOpacity="0.2" />
        </linearGradient>
      </defs>
    </svg>
  );
}
