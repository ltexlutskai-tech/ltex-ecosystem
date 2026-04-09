"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, unknown>) => void;
    };
  }
}

export function AnalyticsClickTracker() {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest<HTMLElement>("[data-analytics]");
      if (!el) return;
      const eventName = el.dataset.analytics;
      if (!eventName) return;
      const href = el.getAttribute("href") ?? undefined;
      window.umami?.track(eventName, href ? { href } : undefined);
    };
    document.addEventListener("click", handler, { capture: true });
    return () =>
      document.removeEventListener("click", handler, { capture: true });
  }, []);

  return null;
}
