"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

/** Мінімальний клієнт для пікера завдання (з /clients/search-all). */
export interface TaskClientItem {
  id: string;
  name: string;
  city: string | null;
  code1C: string | null;
}

/**
 * Легкий (опційний) пікер клієнта для вкладки «Завдання» маршрутного листа.
 * Реюзає `/api/v1/manager/clients/search-all` (повертає `MgrClient.id`).
 * На відміну від order-flow `ClientPicker` — без зв'язку з типами замовлення.
 */
export function TaskClientPicker({
  value,
  selectedName,
  disabled,
  onChange,
}: {
  value: string | null;
  selectedName: string | null;
  disabled?: boolean;
  onChange: (clientId: string | null, name: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<TaskClientItem[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      fetch(
        `/api/v1/manager/clients/search-all?q=${encodeURIComponent(
          query.trim(),
        )}&pageSize=20`,
        { signal: controller.signal },
      )
        .then((r) => r.json())
        .then((json: { items?: TaskClientItem[] }) => {
          setResults(json.items ?? []);
        })
        .catch((e: unknown) => {
          if ((e as { name?: string }).name !== "AbortError") {
            console.warn("[TaskClientPicker] search failed", e);
          }
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, open]);

  if (value && selectedName && !open) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm">
        <span className="font-medium text-gray-800">{selectedName}</span>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Скинути клієнта"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={query}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        placeholder="Клієнт (необов'язково)…"
        className="h-10 w-full rounded-md border border-gray-300 bg-white pl-8 pr-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-white shadow-md">
          {loading && <div className="p-3 text-sm text-gray-500">Пошук…</div>}
          {!loading && results.length === 0 && (
            <div className="p-3 text-sm text-gray-500">Нічого не знайдено</div>
          )}
          <ul>
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(item.id, item.name);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                >
                  <div className="font-medium text-gray-900">{item.name}</div>
                  <div className="text-xs text-gray-500">
                    {item.city ?? "—"} {item.code1C ? `· ${item.code1C}` : ""}
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
