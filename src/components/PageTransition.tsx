"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Smooth page transitions for the App Router, using the native
 * View Transitions API (same buttery effect Barba.js gives classic
 * multi-page sites — but without breaking React state or hydration).
 *
 * How it works:
 * - When the pathname changes, we re-key the wrapper so React unmounts
 *   the old page tree and mounts the new one.
 * - On mount, we call `document.startViewTransition()` and capture the
 *   new page as a snapshot; the CSS in globals.css animates it in
 *   (fade + slide up) while the old page's snapshot fades out.
 * - Browsers without the API (Firefox < 141) just render instantly —
 *   no breakage, no fallback animation library.
 *
 * Usage: wrap the page tree once, in AppShell.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    // Skip the very first paint — only animate on real navigations.
    if (el.dataset.ready !== "true") {
      el.dataset.ready = "true";
      return;
    }

    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
    if (!doc.startViewTransition) return; // graceful no-op

    doc.startViewTransition(() => {
      // Flush synchronously so the snapshot captures the NEW page.
      // (Re-keying happens via React render triggered by the pathname
      // change; forcing a synchronous layout here finalizes it.)
      el.getBoundingClientRect();
    });
  }, [pathname]);

  return (
    <div key={pathname} ref={wrapperRef} className="page-transition" data-ready="false">
      {children}
    </div>
  );
}
