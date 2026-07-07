"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Input } from "@ltex/ui";
import { useDebouncedValue } from "./use-debounced-search";
import type { ClientPickerItem } from "./types";

export function ClientPicker({
  value,
  onChange,
  initialSummary,
}: {
  value: string | null;
  onChange: (clientId: string | null, summary: ClientPickerItem | null) => void;
  initialSummary?: ClientPickerItem | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ClientPickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ClientPickerItem | null>(
    initialSummary ?? null,
  );
  const debouncedQuery = useDebouncedValue(query, 300);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || debouncedQuery.length < 2) {
      setResults([]);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    fetch(
      `/api/v1/manager/clients/search-all?q=${encodeURIComponent(debouncedQuery)}&pageSize=20`,
      { signal: controller.signal },
    )
      .then((r) => r.json())
      .then((json: { items: ClientPickerItem[] }) => {
        setResults(json.items ?? []);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== "AbortError") {
          console.warn("[ClientPicker] search failed", e);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debouncedQuery, open]);

  function selectItem(item: ClientPickerItem): void {
    setSelected(item);
    onChange(item.id, item);
    setOpen(false);
    setQuery("");
  }

  function clear(): void {
    setSelected(null);
    onChange(null, null);
  }

  if (selected && !open) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Клієнт</label>
        <div className="flex items-center justify-between rounded-lg border bg-white p-3">
          <div>
            {/* Свій клієнт → ПІБ клікабельний (картка клієнта); чужий — ні. */}
            {selected.isOwned ? (
              <Link
                href={`/manager/customers/${selected.id}`}
                title="Відкрити картку клієнта"
                className="font-medium text-gray-900 hover:text-green-700 hover:underline"
              >
                {selected.name}
              </Link>
            ) : (
              <div className="font-medium text-gray-900">{selected.name}</div>
            )}
            <div className="text-xs text-gray-500">
              {selected.tradePointName ? `${selected.tradePointName} · ` : ""}
              {selected.city ?? ""}{" "}
              {selected.code1C ? `· ${selected.code1C}` : ""}
              {!selected.isOwned && selected.agent ? (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                  Чужий: {selected.agent.fullName}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              clear();
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Змінити
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">Клієнт</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          type="search"
          value={query}
          autoFocus={open}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Шукати клієнта за іменем, ТТ, кодом або містом…"
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
        <div className="max-h-80 overflow-y-auto rounded-lg border bg-white shadow-sm">
          {loading && <div className="p-3 text-sm text-gray-500">Пошук…</div>}
          {!loading && results.length === 0 && debouncedQuery.length >= 2 && (
            <div className="p-3 text-sm text-gray-500">Нічого не знайдено</div>
          )}
          {!loading && debouncedQuery.length < 2 && (
            <div className="p-3 text-xs text-gray-400">
              Введіть мінімум 2 символи
            </div>
          )}
          <ul>
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => selectItem(item)}
                  className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                >
                  <div className="font-medium text-gray-900">{item.name}</div>
                  <div className="text-xs text-gray-500">
                    {item.tradePointName ? `${item.tradePointName} · ` : ""}
                    {item.city ?? "—"} {item.code1C ? `· ${item.code1C}` : ""}
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
      {value && (
        <button
          type="button"
          onClick={clear}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Скинути вибір
        </button>
      )}
    </div>
  );
}
