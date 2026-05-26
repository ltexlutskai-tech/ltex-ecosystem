"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@ltex/ui";
import type { ReminderClientPickItem } from "./types";

/**
 * Опційний пікер клієнта для нагадування — реюз endpoint-а
 * `/api/v1/manager/clients/search-all` (як ClientPicker замовлення, але
 * самодостатній, без залежності від local типів orders/new).
 */
export function ReminderClientPicker({
  value,
  onChange,
}: {
  value: ReminderClientPickItem | null;
  onChange: (client: ReminderClientPickItem | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ReminderClientPickItem[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open || debounced.length < 2) {
      setResults([]);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    fetch(
      `/api/v1/manager/clients/search-all?q=${encodeURIComponent(debounced)}&pageSize=20`,
      { signal: controller.signal },
    )
      .then((r) => r.json())
      .then((json: { items: ReminderClientPickItem[] }) =>
        setResults(json.items ?? []),
      )
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== "AbortError") {
          console.warn("[ReminderClientPicker] search failed", e);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debounced, open]);

  if (value && !open) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-600">
          Контрагент (необов&apos;язково)
        </label>
        <div className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm">
          <div>
            <span className="font-medium text-gray-900">{value.name}</span>
            <span className="ml-2 text-xs text-gray-500">
              {value.city ?? ""}
              {value.code1C ? ` · ${value.code1C}` : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Прибрати
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">
        Контрагент (необов&apos;язково)
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          type="search"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Шукати клієнта за іменем, кодом або містом…"
          className="pl-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Очистити"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="max-h-72 overflow-y-auto rounded-md border bg-white shadow-sm">
          {loading && <div className="p-3 text-sm text-gray-500">Пошук…</div>}
          {!loading && debounced.length < 2 && (
            <div className="p-3 text-xs text-gray-400">
              Введіть мінімум 2 символи
            </div>
          )}
          {!loading && debounced.length >= 2 && results.length === 0 && (
            <div className="p-3 text-sm text-gray-500">Нічого не знайдено</div>
          )}
          <ul>
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(item);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                >
                  <div className="text-sm font-medium text-gray-900">
                    {item.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {item.city ?? "—"}
                    {item.code1C ? ` · ${item.code1C}` : ""}
                    {!item.isOwned && item.agent ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                        Чужий: {item.agent.fullName}
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
