"use client";

import { useCallback, useEffect, useState } from "react";

const POLL_INTERVAL_MS = 60_000;

interface QueueResponse {
  total: number;
}

/**
 * Лічильник pending-запитів на вилучення для бокової панелі (ТЗ 8.0 B8).
 *
 * Polls `/api/v1/manager/deletions?status=pending` кожні 60с + при поверненні
 * видимості. Червоний бейдж справа від пункту меню. Best-effort: помилки
 * ковтаються мовчки (бейдж не критичний). Рендериться лише для admin/owner
 * (гейтиться батьком у сайдбарі), тож 403 тут не очікується.
 */
export function DeletionsBadge() {
  const [total, setTotal] = useState(0);

  const refetch = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/manager/deletions?status=pending", {
        cache: "no-store",
      });
      if (!r.ok) return;
      const json = (await r.json()) as QueueResponse;
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
    <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white">
      {total > 9 ? "9+" : total}
    </span>
  );
}
