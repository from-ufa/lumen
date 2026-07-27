"use client";

/**
 * Soft navigation for App Router — starts View Transition around router.push
 * so CSS (.lumen-page-body dissolve, frozen header) actually runs.
 * Without this, client Link navigations skip same-document VT.
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
    };
  };

  if (typeof doc.startViewTransition !== "function") {
    go();
    return;
  }

  try {
    doc.startViewTransition(() => {
      go();
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
 * Drop-in Link that runs startViewTransition on primary navigations.
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
        prefetch={prefetch}
        {...rest}
        onClick={(e) => {
          onClick?.(e);
          if (e.defaultPrevented) return;
          // new tab / modified click — let browser handle
          if (
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey ||
            e.button !== 0
          ) {
            return;
          }
          // external
          if (
            hrefStr.startsWith("http") ||
            hrefStr.startsWith("mailto:") ||
            hrefStr.startsWith("#")
          ) {
            return;
          }
          e.preventDefault();
          softNavigate(
            router,
            hrefStr,
            startReactTransition
          );
        }}
      >
        {children}
      </Link>
    );
  }
);
