"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeMessengerRead } from "@/lib/messenger/read-broadcast";

const POLL_INTERVAL_MS = 30_000;

interface UnreadResponse {
  total: number;
}

/**
 * Лічильник непрочитаних повідомлень внутрішнього месенджера для меню.
 * Polls `/api/v1/manager/messenger/unread` кожні 30с + при поверненні видимості.
 * Best-effort: помилки fetch ковтаються мовчки.
 */
export function MessengerUnreadBadge() {
  const [total, setTotal] = useState(0);

  const refetch = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/manager/messenger/unread", {
        cache: "no-store",
      });
      if (!r.ok) return;
      const json = (await r.json()) as UnreadResponse;
      setTotal(typeof json.total === "number" ? json.total : 0);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void refetch();
    const id = window.setInterval(() => void refetch(), POLL_INTERVAL_MS);
    function onVis() {
      if (document.visibilityState === "visible") void refetch();
    }
    document.addEventListener("visibilitychange", onVis);
    // Миттєвий refetch, коли розмову прочитано в iframe-вкладці месенджера.
    const unsub = subscribeMessengerRead(() => void refetch());
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      unsub();
    };
  }, [refetch]);

  if (total <= 0) return null;
  return (
    <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white">
      {total > 9 ? "9+" : total}
    </span>
  );
}
