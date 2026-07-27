"use client";

/**
 * Soft navigation for App Router.
 *
 * IMPORTANT: never await pathname inside startViewTransition — that deadlocks
 * with Next's async router (page freezes ~4–5s). Fire router.push inside VT
 * and return immediately; LumenPageBody handles enter motion reliably.
 */

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import {
  forwardRef,
  useCallback,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
} from "react";

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function normalizePath(href: string): string {
  try {
    if (href.startsWith("http")) {
      return new URL(href).pathname.replace(/\/$/, "") || "/";
    }
  } catch {
    /* */
  }
  const path = href.split("?")[0].split("#")[0];
  return path.replace(/\/$/, "") || "/";
}

/** Navigate ASAP; optional View Transition snapshot without blocking */
export function softNavigate(
  router: { push: (href: string) => void },
  href: string
) {
  const go = () => {
    router.push(href);
  };

  if (typeof document === "undefined" || prefersReducedMotion()) {
    go();
    return;
  }

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };

  if (typeof doc.startViewTransition !== "function") {
    go();
    return;
  }

  try {
    // Do NOT return a long Promise here — freezes the UI until it resolves.
    // Next router is async; morph is best-effort, enter animation is guaranteed
    // via LumenPageBody.
    doc.startViewTransition(() => {
      go();
    });
  } catch {
    go();
  }
}

export function useSoftNavigate() {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      softNavigate(router, href);
    },
    [router]
  );
}

type SoftLinkProps = Omit<
  ComponentPropsWithoutRef<"a">,
  "href" | "onClick"
> &
  LinkProps & {
    href: string;
    children: ReactNode;
    onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  };

export const SoftLink = forwardRef<HTMLAnchorElement, SoftLinkProps>(
  function SoftLink(
    { href, onClick, children, replace, scroll, prefetch, ...rest },
    ref
  ) {
    const router = useRouter();
    const hrefStr = typeof href === "string" ? href : String(href);

    return (
      <Link
        ref={ref}
        href={href}
        replace={replace}
        scroll={scroll}
        prefetch={prefetch ?? true}
        {...rest}
        onClick={(e) => {
          onClick?.(e);
          if (e.defaultPrevented) return;
          if (
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey ||
            e.button !== 0
          ) {
            return;
          }
          if (
            hrefStr.startsWith("http") ||
            hrefStr.startsWith("mailto:") ||
            hrefStr.startsWith("#")
          ) {
            return;
          }
          if (
            typeof window !== "undefined" &&
            normalizePath(hrefStr) ===
              normalizePath(window.location.pathname)
          ) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          softNavigate(router, hrefStr);
        }}
      >
        {children}
      </Link>
    );
  }
);
