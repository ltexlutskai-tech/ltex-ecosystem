"use client";

import { useCallback, useEffect, useState } from "react";

const POLL_INTERVAL_MS = 60_000;

interface CountsResponse {
  orders: number;
  sales: number;
}

/**
 * Індикатор кількості документів «Очікує підтвердження» (pending) для сайдбару.
 * `kind` обирає поле відповіді: замовлення чи реалізації. Polling 60с + при
 * поверненні видимості вкладки. Помилки ковтаються (бейдж не критичний).
 */
export function PendingBadge({ kind }: { kind: "orders" | "sales" }) {
  const [count, setCount] = useState(0);

  const refetch = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/manager/pending-counts", {
        cache: "no-store",
      });
      if (!r.ok) return;
      const json = (await r.json()) as CountsResponse;
      setCount(typeof json[kind] === "number" ? json[kind] : 0);
    } catch {
      // silent
    }
  }, [kind]);

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

  if (count <= 0) return null;
  return (
    <span
      className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white"
      title="Очікує підтвердження"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
