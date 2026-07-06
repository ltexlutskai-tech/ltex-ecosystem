"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Лічильник візитів (7.2 Блок 4). Надсилає бекон на кожен перехід сторінкою.
 * Без кукі; сервер рахує агрегати. Не блокує навігацію.
 */
export function VisitTracker() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      const sent =
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function" &&
        navigator.sendBeacon("/api/track/visit");
      if (!sent) {
        fetch("/api/track/visit", { method: "POST", keepalive: true }).catch(
          () => {},
        );
      }
    } catch {
      // ignore
    }
  }, [pathname]);
  return null;
}
