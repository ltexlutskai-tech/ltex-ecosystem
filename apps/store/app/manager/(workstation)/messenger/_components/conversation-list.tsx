"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Input } from "@ltex/ui";
import { formatRelativeShort } from "../../_components/format-relative";
import { Avatar } from "./avatar";
import type {
  ConversationsListResponse,
  MessengerConversationListItem,
} from "./types";

const POLL_INTERVAL_MS = 15_000;

export function ConversationList({
  selectedId,
  onSelect,
  onNewChat,
  onOpenSearch,
  refreshKey,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onOpenSearch: () => void;
  refreshKey: number;
}) {
  const [items, setItems] = useState<MessengerConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/manager/messenger/conversations", {
        cache: "no-store",
      });
      if (!r.ok) return;
      const json = (await r.json()) as ConversationsListResponse;
      setItems(json.conversations ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
    const id = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    function onVis() {
      if (document.visibilityState === "visible") void load();
    }
    function onFocus() {
      void load();
    }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (refreshKey > 0) void load();
  }, [refreshKey, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => c.title.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="flex h-full w-full flex-col border-r bg-white lg:w-[340px]">
      <div className="space-y-2 border-b px-3 py-2">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onNewChat}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            Новий чат
          </button>
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Пошук у повідомленнях"
            title="Пошук у повідомленнях"
            className="flex items-center justify-center rounded-md border border-gray-200 px-3 text-gray-600 hover:bg-gray-50"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук…"
            className="pl-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Очистити"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton />
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {items.length === 0
              ? "Розмов ще немає. Натисніть «Новий чат», щоб написати колезі."
              : "Нічого не знайдено."}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                selected={c.id === selectedId}
                onClick={() => onSelect(c.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConversationItem({
  conversation,
  selected,
  onClick,
}: {
  conversation: MessengerConversationListItem;
  selected: boolean;
  onClick: () => void;
}) {
  const c = conversation;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={
          selected
            ? "flex w-full items-start gap-2.5 bg-green-50 px-3 py-2.5 text-left"
            : "flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50"
        }
      >
        <Avatar name={c.title} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-gray-800">
              {c.title}
            </p>
            <span className="ml-auto shrink-0 text-[11px] text-gray-400">
              {formatRelativeShort(c.lastMessageAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {c.lastMessagePreview ?? "Немає повідомлень"}
          </p>
        </div>
        {c.unread > 0 && (
          <span className="ml-1 mt-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-medium text-white">
            {c.unread > 9 ? "9+" : c.unread}
          </span>
        )}
      </button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-gray-100">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="px-3 py-3">
          <div className="flex gap-2.5">
            <div className="h-9 w-9 animate-pulse rounded-full bg-gray-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
