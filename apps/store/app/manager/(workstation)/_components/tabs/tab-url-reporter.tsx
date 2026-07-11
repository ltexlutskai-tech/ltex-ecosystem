"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Повідомити host-у поточний URL цього iframe (для відновлення при refresh). */
export function reportTabUrl(): void {
  if (typeof window === "undefined" || window.parent === window) return;
  const tabId = window.name;
  if (!tabId) return;
  const url = window.location.pathname + window.location.search;
  if (!url.startsWith("/manager")) return;
  window.parent.postMessage(
    { type: "ltex:tab-url", tabId, url },
    window.location.origin,
  );
}

/**
 * Повідомляє host-у (shell) поточний URL цього iframe при кожній навігації —
 * щоб збережений URL вкладки оновлювався, і оновлення сторінки браузера
 * відновлювало поточне місце (а не початок блоку). Працює лише всередині
 * iframe-shell (коли `window.name` = id вкладки, який ставить IframeHost).
 */
export function TabUrlReporter() {
  const pathname = usePathname();
  useEffect(() => {
    reportTabUrl();
  }, [pathname]);
  return null;
}
