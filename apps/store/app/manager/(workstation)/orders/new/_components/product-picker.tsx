"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@ltex/ui";
import { useDebouncedValue } from "./use-debounced-search";
import type { ProductSummary } from "./types";

export function ProductPicker({
  value,
  onChange,
}: {
  value: ProductSummary | null;
  onChange: (product: ProductSummary | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(false);
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
      `/api/v1/manager/products/search?q=${encodeURIComponent(debouncedQuery)}`,
      { signal: controller.signal },
    )
      .then((r) => r.json())
      .then((json: { items: ProductSummary[] }) => {
        setResults(json.items ?? []);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== "AbortError") {
          console.warn("[ProductPicker] search failed", e);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debouncedQuery, open]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded border bg-white px-3 py-2 text-sm">
        <div>
          <div className="font-medium text-gray-900">{value.name}</div>
          <div className="text-xs text-gray-500">
            {value.articleCode ?? "—"} {value.code1C ? `· ${value.code1C}` : ""}{" "}
            · {value.priceUnit === "kg" ? "за кг" : "за шт"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          Змінити
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        type="search"
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        placeholder="Шукати товар…"
        className="text-sm"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
          {loading && <div className="p-2 text-xs text-gray-500">Пошук…</div>}
          {!loading && debouncedQuery.length < 2 && (
            <div className="p-2 text-xs text-gray-400">
              Введіть мінімум 2 символи
            </div>
          )}
          {!loading && results.length === 0 && debouncedQuery.length >= 2 && (
            <div className="p-2 text-xs text-gray-500">Нічого не знайдено</div>
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
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <div className="font-medium text-gray-900">{item.name}</div>
                  <div className="text-xs text-gray-500">
                    {item.articleCode ?? "—"}{" "}
                    {item.code1C ? `· ${item.code1C}` : ""} ·{" "}
                    {item.priceUnit === "kg" ? "за кг" : "за шт"}
                    {item.averageWeight ? ` · ~${item.averageWeight} кг` : ""}
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
