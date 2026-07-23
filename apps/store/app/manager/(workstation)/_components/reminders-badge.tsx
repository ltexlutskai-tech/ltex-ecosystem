"use client";

import { useCallback, useEffect, useState } from "react";

const POLL_INTERVAL_MS = 30_000;

/**
 * Лічильник незакритих нагадувань «на мене» для пункту «Нагадування» у сайдбарі.
 * Polling 30с + при поверненні видимості. Помилки ковтаються.
 */
export function RemindersBadge() {
  const [total, setTotal] = useState(0);

  const refetch = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/manager/reminders/count", {
        cache: "no-store",
      });
      if (!r.ok) return;
      const json = (await r.json()) as { total: number };
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
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refetch]);

  if (total <= 0) return null;
  return (
    <span
      className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-medium text-white"
      title="Незакриті нагадування"
    >
      {total > 9 ? "9+" : total}
    </span>
  );
}
