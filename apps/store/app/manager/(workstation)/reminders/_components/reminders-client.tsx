"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Button, Input } from "@ltex/ui";
import { ReminderCreateForm } from "./reminder-create-form";
import { ReminderListItem } from "./reminder-list-item";
import type { ReminderRow } from "./types";

export function RemindersClient({
  currentUserId,
  currentUserRole,
}: {
  currentUserId: string;
  currentUserRole: string;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [onlyOrderVideo, setOnlyOrderVideo] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [items, setItems] = useState<ReminderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (showCompleted) params.set("completed", "true");
    if (onlyOrderVideo) params.set("orderVideo", "true");
    if (debounced.length > 0) params.set("q", debounced);
    params.set("pageSize", "100");
    fetch(`/api/v1/manager/reminders?${params.toString()}`)
      .then((r) => r.json())
      .then((json: { reminders?: ReminderRow[]; total?: number }) => {
        setItems(json.reminders ?? []);
        setTotal(json.total ?? 0);
      })
      .catch((e: unknown) => {
        console.warn("[RemindersClient] load failed", e);
      })
      .finally(() => setLoading(false));
  }, [showCompleted, onlyOrderVideo, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {!showForm && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук за описом…"
              className="pl-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Очистити"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="accent-green-600"
            />
            Завершені
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={onlyOrderVideo}
              onChange={(e) => setOnlyOrderVideo(e.target.checked)}
              className="accent-green-600"
            />
            Заказ відео
          </label>
          <Button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            Створити
          </Button>
        </div>
      )}

      {showForm && (
        <ReminderCreateForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-500">Завантаження…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-gray-500">
          {showCompleted || onlyOrderVideo || debounced
            ? "Нагадувань за обраними фільтрами не знайдено."
            : "У вас поки немає активних нагадувань. Натисніть «Створити»."}
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500">Усього: {total}</p>
          <div className="space-y-2">
            {items.map((r) => (
              <ReminderListItem
                key={r.id}
                reminder={r}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                onChanged={load}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
