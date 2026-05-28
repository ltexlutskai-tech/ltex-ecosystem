"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@ltex/ui";
import { BrandIcon } from "../../_components/brand-icons";
import { formatRelativeShort } from "../../_components/format-relative";
import type { ConversationListItem, ConversationListResponse } from "./types";

const POLL_INTERVAL_MS = 30_000;

type StatusFilter = "active" | "all";

export function ConversationList({
  selectedId,
  onSelect,
  refreshKey,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Зовнішній bump (наприклад після відмітки read) — перезавантажити список. */
  refreshKey: number;
}) {
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/manager/chat/conversations?pageSize=100", {
        cache: "no-store",
      });
      if (!r.ok) return;
      const json = (await r.json()) as ConversationListResponse;
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

  // Зовнішній bump (mark-as-read тощо).
  useEffect(() => {
    if (refreshKey > 0) void load();
  }, [refreshKey, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (statusFilter === "active" && c.status !== "active") return false;
      if (!q) return true;
      const haystack = [
        c.client?.name,
        c.externalUserName,
        c.phone,
        c.externalUserId,
      ]
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search, statusFilter]);

  return (
    <div className="flex h-full w-full flex-col border-r bg-white lg:w-[340px]">
      <div className="space-y-2 border-b px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук розмов…"
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
        <div className="flex gap-1 text-xs">
          <FilterPill
            active={statusFilter === "active"}
            onClick={() => setStatusFilter("active")}
            label="Активні"
          />
          <FilterPill
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            label="Усі"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <ConversationListSkeleton />
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {items.length === 0
              ? "Розмов ще немає. Боти TG/Viber отримають перші повідомлення."
              : "За фільтром нічого не знайдено."}
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

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-green-600 px-2.5 py-0.5 text-white"
          : "rounded-full border border-gray-200 px-2.5 py-0.5 text-gray-600 hover:bg-gray-50"
      }
    >
      {label}
    </button>
  );
}

function ConversationItem({
  conversation,
  selected,
  onClick,
}: {
  conversation: ConversationListItem;
  selected: boolean;
  onClick: () => void;
}) {
  const c = conversation;
  const primary =
    c.client?.name ??
    c.externalUserName ??
    c.phone ??
    `#${c.externalUserId.slice(0, 12)}`;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={
          selected
            ? "flex w-full items-start gap-2 bg-green-50 px-3 py-2 text-left"
            : "flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-gray-50"
        }
      >
        <BrandIcon kind={c.platform} className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-gray-800">
              {primary}
            </p>
            <span className="ml-auto shrink-0 text-[11px] text-gray-400">
              {formatRelativeShort(c.lastMessageAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {c.client ? null : (
              <span className="mr-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500">
                Невпізнаний
              </span>
            )}
            {c.phone ?? c.externalUserId}
          </p>
        </div>
        {c.unreadForManager > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-medium text-white">
            {c.unreadForManager > 9 ? "9+" : c.unreadForManager}
          </span>
        )}
      </button>
    </li>
  );
}

function ConversationListSkeleton() {
  return (
    <ul className="divide-y divide-gray-100">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="px-3 py-3">
          <div className="flex gap-2">
            <div className="h-4 w-4 animate-pulse rounded bg-gray-200" />
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
