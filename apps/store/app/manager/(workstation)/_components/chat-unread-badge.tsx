"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeChatRead } from "@/lib/chat/read-broadcast";

const POLL_INTERVAL_MS = 30_000;

interface UnreadResponse {
  total: number;
}

/**
 * Лічильник непрочитаних чат-повідомлень для бокової панелі.
 *
 * Polls `/api/v1/manager/chat/unread` кожні 30с + при поверненні видимості.
 * Рендериться як червоний бейдж справа від тексту «Чат».
 *
 * Best-effort: помилки fetch ковтаються мовчки (бейдж не критичний).
 */
export function ChatUnreadBadge() {
  const [total, setTotal] = useState(0);

  const refetch = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/manager/chat/unread", {
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
    // Миттєвий refetch коли розмову прочитано в iframe-вкладці (inbox / картка).
    const unsubscribe = subscribeChatRead(() => void refetch());
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      unsubscribe();
    };
  }, [refetch]);

  if (total <= 0) return null;
  return (
    <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white">
      {total > 9 ? "9+" : total}
    </span>
  );
}
