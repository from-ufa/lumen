"use client";

/**
 * Soft navigation for App Router.
 *
 * Critical: startViewTransition's callback must not finish until the new route
 * has committed to the DOM. router.push is async — we await pathname change
 * (+ 2 rAFs) so old/new snapshots differ and shared morph actually runs.
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
import { useTransition } from "react";

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

/** Resolve when location.pathname matches target (Next client nav finished paint). */
function waitForPathname(href: string, timeoutMs = 4000): Promise<void> {
  const target = normalizePath(href);
  return new Promise((resolve) => {
    const now = () =>
      (typeof window !== "undefined"
        ? window.location.pathname
        : ""
      ).replace(/\/$/, "") || "/";

    if (now() === target) {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      return;
    }

    const t0 = Date.now();
    const tick = () => {
      if (now() === target || Date.now() - t0 > timeoutMs) {
        // Two frames: let React commit + browser paint new VT names
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve())
        );
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Navigate with View Transition when browser supports it */
export function softNavigate(
  router: { push: (href: string) => void },
  href: string,
  startReactTransition: (cb: () => void) => void
) {
  const go = () => {
    startReactTransition(() => {
      router.push(href);
    });
  };

  if (typeof document === "undefined" || prefersReducedMotion()) {
    go();
    return;
  }

  const doc = document as Document & {
    startViewTransition?: (cb: () => void | Promise<void>) => {
      finished: Promise<void>;
      ready: Promise<void>;
      updateCallbackDone: Promise<void>;
    };
  };

  if (typeof doc.startViewTransition !== "function") {
    go();
    return;
  }

  try {
    // Async callback: hold VT open until Next has rendered the destination
    doc.startViewTransition(async () => {
      go();
      await waitForPathname(href);
    });
  } catch {
    go();
  }
}

export function useSoftNavigate() {
  const router = useRouter();
  const [, startReactTransition] = useTransition();

  return useCallback(
    (href: string) => {
      softNavigate(router, href, startReactTransition);
    },
    [router, startReactTransition]
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

/**
 * Drop-in Link that runs a *correct* startViewTransition around client nav.
 */
export const SoftLink = forwardRef<HTMLAnchorElement, SoftLinkProps>(
  function SoftLink(
    { href, onClick, children, replace, scroll, prefetch, ...rest },
    ref
  ) {
    const router = useRouter();
    const [, startReactTransition] = useTransition();
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
          // Same page — nothing to morph
          if (normalizePath(hrefStr) === normalizePath(window.location.pathname)) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          softNavigate(router, hrefStr, startReactTransition);
        }}
      >
        {children}
      </Link>
    );
  }
);
