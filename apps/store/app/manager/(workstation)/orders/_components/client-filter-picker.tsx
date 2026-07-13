"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@ltex/ui";

interface ClientHit {
  id: string;
  code1C: string | null;
  name: string;
  city: string | null;
}

/**
 * Фільтр списку замовлень «Клієнт» — пошуковий вибір з довідника (замість
 * вільного вводу, щоб уникнути опечаток, 8.1). Вибір клієнта задає фільтр по
 * `clientCode1C` (точний), а для клієнтів без code1C — по `clientName`.
 */
export function ClientFilterPicker({
  currentLabel,
  onSelect,
  onClear,
}: {
  /** Поточно вибраний клієнт (для показу), або null. */
  currentLabel: string | null;
  onSelect: (hit: { code1C: string | null; name: string }) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ClientHit[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      const params = new URLSearchParams({ pageSize: "20", q });
      fetch(`/api/v1/manager/clients/search-all?${params.toString()}`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((json: { items?: ClientHit[] }) => {
          setResults(json.items ?? []);
        })
        .catch((e: unknown) => {
          if ((e as { name?: string }).name !== "AbortError") {
            console.warn("[ClientFilterPicker] search failed", e);
          }
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query, open]);

  if (currentLabel) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-green-300 bg-green-50 px-3 text-sm text-green-800">
        <span className="truncate">{currentLabel}</span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Скинути клієнта"
          className="text-green-700 hover:text-green-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Почніть вводити назву…"
        className="h-9 pl-8"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-white shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-xs text-gray-400">Пошук…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">
              Нічого не знайдено
            </div>
          )}
          {results.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({ code1C: hit.code1C, name: hit.name });
                setQuery("");
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
            >
              <div className="font-medium text-gray-800">{hit.name}</div>
              <div className="text-xs text-gray-500">
                {hit.city ?? "—"} {hit.code1C ? `· ${hit.code1C}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
