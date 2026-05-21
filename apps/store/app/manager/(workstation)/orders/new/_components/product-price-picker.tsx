"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from "@ltex/ui";
import { useDebouncedValue } from "./use-debounced-search";
import { unitPriceForType } from "@/lib/manager/order-pricing";
import { bagWeightForQuantity } from "@/lib/manager/order-bag-weight";
import type { ProductSummary } from "./types";

/**
 * Модалка «Підбір» — по суті прайс зі старого 1С. Менеджер шукає товар,
 * вказує **кількість мішків** і додає позицію. Конкретний лот не вибирається
 * (центральна 1С не приймає такий формат) — позиція завжди загальна.
 *
 * При «Додати» батьку повертається товар + кількість мішків; розрахунок ваги
 * (`bagWeightForQuantity`) і ціни (`unitPriceForType`) робить `onAdd`-callback
 * у формі (де є обраний тип цін).
 */
export function ProductPricePicker({
  open,
  onOpenChange,
  priceTypeCode,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Код обраного типу цін — для прев'ю ціни за кг у списку. */
  priceTypeCode: string | null;
  /** Додати позицію: товар + кількість мішків (lotId завжди null). */
  onAdd: (product: ProductSummary, bags: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(false);
  // Кількість мішків per-product (uid → bags), дефолт 1.
  const [bagsByProduct, setBagsByProduct] = useState<Record<string, number>>(
    {},
  );
  const debouncedQuery = useDebouncedValue(query, 300);
  const abortRef = useRef<AbortController | null>(null);

  // Скидаємо стан при відкритті.
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setBagsByProduct({});
    }
  }, [open]);

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
          console.warn("[ProductPricePicker] search failed", e);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debouncedQuery, open]);

  function bagsFor(id: string): number {
    return bagsByProduct[id] ?? 1;
  }

  function setBags(id: string, value: number): void {
    setBagsByProduct((prev) => ({
      ...prev,
      [id]: Math.max(1, Math.floor(value) || 1),
    }));
  }

  function add(product: ProductSummary): void {
    onAdd(product, bagsFor(product.id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Підбір товарів (прайс)</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Шукати товар за назвою, артикулом або кодом…"
            className="pl-8"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto rounded-lg border">
          {loading && <div className="p-4 text-sm text-gray-500">Пошук…</div>}
          {!loading && debouncedQuery.length < 2 && (
            <div className="p-4 text-sm text-gray-400">
              Введіть мінімум 2 символи для пошуку.
            </div>
          )}
          {!loading && results.length === 0 && debouncedQuery.length >= 2 && (
            <div className="p-4 text-sm text-gray-500">Нічого не знайдено.</div>
          )}
          <ul className="divide-y">
            {results.map((p) => {
              const unit = unitPriceForType(p.prices, priceTypeCode);
              const bags = bagsFor(p.id);
              const previewWeight = bagWeightForQuantity(
                { averageWeight: p.averageWeight },
                bags,
              );
              const previewTotal =
                unit !== null
                  ? Math.round(unit * previewWeight * 100) / 100
                  : null;
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-gray-900">
                      {p.name}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {p.articleCode ?? "—"}
                      {p.code1C ? ` · ${p.code1C}` : ""} ·{" "}
                      {p.priceUnit === "kg" ? "за кг" : "за шт"}
                      {unit !== null
                        ? ` · ${unit.toFixed(2)} €/кг`
                        : " · ціна вручну"}
                      {p.averageWeight ? ` · ~${p.averageWeight} кг/міш.` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Мішків</label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={bags}
                      onChange={(e) => setBags(p.id, Number(e.target.value))}
                      className="h-8 w-16 text-sm"
                    />
                  </div>
                  <div className="w-24 text-right text-xs text-gray-500">
                    {previewTotal !== null ? (
                      <span className="font-medium text-gray-800">
                        {previewTotal.toFixed(2)} €
                      </span>
                    ) : (
                      "—"
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => add(p)}
                    className="bg-green-600 text-white hover:bg-green-700"
                  >
                    Додати
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Закрити
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
