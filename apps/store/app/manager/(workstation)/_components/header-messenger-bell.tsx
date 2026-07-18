"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { subscribeMessengerRead } from "@/lib/messenger/read-broadcast";
import { useTabsOptional } from "./tabs/tabs-context";

const POLL_INTERVAL_MS = 30_000;

interface ConversationRow {
  id: string;
  title: string;
  lastMessagePreview: string | null;
  unread: number;
}

/**
 * Дзвіночок месенджера у шапці: іконка з лічильником непрочитаних + список
 * розмов з непрочитаними. Клік по розмові відкриває месенджер на ній
 * (через вкладки робочого столу, з fallback на роутер).
 */
export function HeaderMessengerBell() {
  const tabs = useTabsOptional();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<ConversationRow[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const refetchCount = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/manager/messenger/unread", {
        cache: "no-store",
      });
      if (!r.ok) return;
      const j = (await r.json()) as { total: number };
      setTotal(typeof j.total === "number" ? j.total : 0);
    } catch {
      // silent
    }
  }, []);

  const refetchList = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/manager/messenger/conversations", {
        cache: "no-store",
      });
      if (!r.ok) return;
      const j = (await r.json()) as { conversations: ConversationRow[] };
      setItems((j.conversations ?? []).filter((c) => c.unread > 0));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void refetchCount();
    const id = window.setInterval(() => void refetchCount(), POLL_INTERVAL_MS);
    function onVis() {
      if (document.visibilityState === "visible") void refetchCount();
    }
    document.addEventListener("visibilitychange", onVis);
    // Миттєвий refetch, коли розмову прочитано в iframe-вкладці месенджера.
    const unsub = subscribeMessengerRead(() => void refetchCount());
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      unsub();
    };
  }, [refetchCount]);

  useEffect(() => {
    if (!open) return;
    void refetchList();
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, refetchList]);

  function goTo(conversationId?: string) {
    setOpen(false);
    const url = conversationId
      ? `/manager/messenger?c=${conversationId}`
      : "/manager/messenger";
    if (tabs) tabs.openTab(url, "Месенджер");
    else router.push(url);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Месенджер"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
      >
        <MessagesSquare className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-80 rounded-md border bg-white text-sm shadow-lg"
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="font-medium text-gray-800">Месенджер</p>
            <button
              type="button"
              onClick={() => goTo()}
              className="text-xs font-medium text-green-700 hover:underline"
            >
              Відкрити всі
            </button>
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-gray-400">
              Непрочитаних повідомлень нема.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => goTo(c.id)}
                    className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-medium text-gray-800">
                        {c.title}
                      </p>
                      <span className="ml-auto inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                        {c.unread > 9 ? "9+" : c.unread}
                      </span>
                    </div>
                    {c.lastMessagePreview && (
                      <p className="mt-0.5 truncate text-[11px] text-gray-500">
                        {c.lastMessagePreview}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
