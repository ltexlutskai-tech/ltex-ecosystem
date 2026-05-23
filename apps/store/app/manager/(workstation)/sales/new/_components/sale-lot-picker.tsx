"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Eye, ArrowLeft, ScanLine, Check } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from "@ltex/ui";
import { useDebouncedValue } from "../../../orders/new/_components/use-debounced-search";
import { unitPriceForType } from "@/lib/manager/order-pricing";
import { bagWeightForQuantity } from "@/lib/manager/order-bag-weight";
import type { ProductSummary, SaleLotSummary } from "./sale-types";

/**
 * Блок «Реалізація» — двокроковий підбір з прив'язкою до **конкретного лота**.
 *
 *   Крок 1: пошук товару (той самий `/products/search?q=` — повертає `prices[]`).
 *   Крок 2: список вільних лотів товару (`/products/[id]/lots?q=`) з пошуком
 *           по частковому ШК АБО вазі. Вибір лота додає рядок з фіксованим
 *           lotId/barcode/weight та прайсовою ціною за кг (за типом цін).
 *
 * Додатково — кнопка «Додати як загальну позицію (без лота)» для товарів без
 * вільних лотів: створює рядок з `lotId=null` і середньою вагою мішка (як у
 * замовленнях). Конкретний лот — основний шлях у Реалізації (на відміну від
 * Замовлень, де central 1С не приймає лот).
 */

/** Лот, доданий через підбір (конкретний мішок). */
export interface SaleLotPick {
  product: ProductSummary;
  lotId: string;
  barcode: string;
  weight: number;
  pricePerKg: number;
}

/** Загальна позиція без лота (fallback). */
export interface SaleGeneralPick {
  product: ProductSummary;
  bags: number;
  pricePerKg: number;
}

export function SaleLotPicker({
  open,
  onOpenChange,
  priceTypeCode,
  onAddLot,
  onAddGeneral,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Код обраного типу цін — для дефолту ціни за кг. */
  priceTypeCode: string | null;
  /** Додати рядок з конкретним лотом. */
  onAddLot: (pick: SaleLotPick) => void;
  /** Додати загальну позицію без лота (середня вага × мішки). */
  onAddGeneral: (pick: SaleGeneralPick) => void;
}) {
  const [step, setStep] = useState<"product" | "lots">("product");
  const [selected, setSelected] = useState<ProductSummary | null>(null);

  // Які лоти/позиції вже додані у цьому сеансі підбору — щоб кнопка
  // «Додати» перемикалась на «Додано» (модалка лишається відкритою для
  // додавання кількох мішків поспіль).
  const [addedLotIds, setAddedLotIds] = useState<Set<string>>(new Set());
  const [addedGeneral, setAddedGeneral] = useState(false);

  // ─── Крок 1: пошук товару ──────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);
  const searchAbort = useRef<AbortController | null>(null);

  // ─── Крок 2: лоти товару ───────────────────────────────────────────────
  const [lotQuery, setLotQuery] = useState("");
  const [lots, setLots] = useState<SaleLotSummary[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const debouncedLotQuery = useDebouncedValue(lotQuery, 300);
  const lotsAbort = useRef<AbortController | null>(null);

  // Скидаємо стан при відкритті.
  useEffect(() => {
    if (open) {
      setStep("product");
      setSelected(null);
      setQuery("");
      setResults([]);
      setLotQuery("");
      setLots([]);
      setAddedLotIds(new Set());
      setAddedGeneral(false);
    }
  }, [open]);

  // Пошук товару.
  useEffect(() => {
    if (!open || step !== "product" || debouncedQuery.length < 2) {
      setResults([]);
      return;
    }
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
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
          console.warn("[SaleLotPicker] product search failed", e);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debouncedQuery, open, step]);

  // Завантаження/фільтрація лотів обраного товару.
  useEffect(() => {
    if (!open || step !== "lots" || !selected) return;
    lotsAbort.current?.abort();
    const controller = new AbortController();
    lotsAbort.current = controller;
    setLotsLoading(true);
    const url = new URL(
      `/api/v1/manager/products/${selected.id}/lots`,
      window.location.origin,
    );
    if (debouncedLotQuery.trim()) {
      url.searchParams.set("q", debouncedLotQuery.trim());
    }
    fetch(url.toString(), { signal: controller.signal })
      .then((r) => r.json())
      .then((json: { items: SaleLotSummary[] }) => {
        setLots(json.items ?? []);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== "AbortError") {
          console.warn("[SaleLotPicker] lots fetch failed", e);
        }
      })
      .finally(() => setLotsLoading(false));
    return () => controller.abort();
  }, [open, step, selected, debouncedLotQuery]);

  function pickProduct(product: ProductSummary): void {
    setSelected(product);
    setLotQuery("");
    setLots([]);
    setAddedLotIds(new Set());
    setAddedGeneral(false);
    setStep("lots");
  }

  function backToProducts(): void {
    setStep("product");
    setSelected(null);
    setLotQuery("");
    setLots([]);
    setAddedLotIds(new Set());
    setAddedGeneral(false);
  }

  function addLot(lot: SaleLotSummary): void {
    if (!selected) return;
    const pricePerKg = unitPriceForType(selected.prices, priceTypeCode) ?? 0;
    onAddLot({
      product: selected,
      lotId: lot.id,
      barcode: lot.barcode,
      weight: lot.weight > 0 ? lot.weight : 0,
      pricePerKg: Math.max(0, pricePerKg),
    });
    setAddedLotIds((prev) => new Set(prev).add(lot.id));
  }

  function addGeneral(): void {
    if (!selected) return;
    const pricePerKg = unitPriceForType(selected.prices, priceTypeCode) ?? 0;
    onAddGeneral({
      product: selected,
      bags: 1,
      pricePerKg: Math.max(0, pricePerKg),
    });
    setAddedGeneral(true);
  }

  const previewPrice = selected
    ? (unitPriceForType(selected.prices, priceTypeCode) ?? 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "product" ? "Підбір товару" : "Вибір лота (мішка)"}
          </DialogTitle>
        </DialogHeader>

        {step === "product" && (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                type="search"
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Шукати товар за назвою, артикулом або кодом…"
                className="pl-9"
              />
            </div>

            <div className="max-h-[60vh] min-w-0 divide-y overflow-y-auto rounded-lg border bg-white">
              {loading && (
                <div className="p-4 text-sm text-gray-500">Пошук…</div>
              )}
              {!loading && debouncedQuery.length < 2 && (
                <div className="p-4 text-sm text-gray-400">
                  Введіть мінімум 2 символи для пошуку.
                </div>
              )}
              {!loading &&
                results.length === 0 &&
                debouncedQuery.length >= 2 && (
                  <div className="p-4 text-sm text-gray-500">
                    Нічого не знайдено.
                  </div>
                )}
              {results.map((p) => {
                const hasPrice =
                  unitPriceForType(p.prices, priceTypeCode) !== null;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 p-3 hover:bg-gray-50"
                  >
                    <a
                      href={`/manager/prices/${p.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Відкрити картку товару у новій вкладці"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:border-green-400 hover:text-green-600"
                      aria-label="Переглянути картку товару"
                    >
                      <Eye className="h-4 w-4" />
                    </a>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-gray-900">
                        {p.name}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {p.articleCode ?? "—"}
                        {p.code1C ? ` · ${p.code1C}` : ""} ·{" "}
                        {p.priceUnit === "kg" ? "за кг" : "за шт"}
                        {hasPrice ? "" : " · ціна вручну"}
                        {p.averageWeight
                          ? ` · ~${p.averageWeight} кг/міш.`
                          : ""}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => pickProduct(p)}
                      className="shrink-0 bg-green-600 text-white hover:bg-green-700"
                    >
                      Вибрати лот →
                    </Button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {step === "lots" && selected && (
          <>
            <div className="flex items-start justify-between gap-3 rounded-lg border bg-gray-50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-gray-900">
                  {selected.name}
                </div>
                <div className="text-xs text-gray-500">
                  Ціна за кг (тип цін):{" "}
                  <span className="font-medium text-gray-700">
                    {previewPrice > 0 ? `${previewPrice.toFixed(2)} €` : "—"}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={backToProducts}
                className="shrink-0"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Інший товар
              </Button>
            </div>

            <div className="relative">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                type="search"
                value={lotQuery}
                onChange={(e) => setLotQuery(e.target.value)}
                placeholder="Фільтр за штрихкодом або вагою (напр. 20)…"
                className="pl-9"
              />
            </div>

            <div className="max-h-[50vh] min-w-0 divide-y overflow-y-auto rounded-lg border bg-white">
              {lotsLoading && (
                <div className="p-4 text-sm text-gray-500">Завантаження…</div>
              )}
              {!lotsLoading && lots.length === 0 && (
                <div className="p-4 text-sm text-gray-500">
                  {lotQuery.trim()
                    ? "Лотів за фільтром не знайдено."
                    : "Вільних лотів немає — додайте як загальну позицію."}
                </div>
              )}
              {lots.map((lot) => {
                const added = addedLotIds.has(lot.id);
                return (
                  <div
                    key={lot.id}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="break-all font-mono text-sm text-gray-900">
                        ШК {lot.barcode}
                      </div>
                      <div className="text-xs text-gray-500">
                        {lot.weight.toFixed(1)} кг
                        {lot.quantity ? ` · ${lot.quantity} шт/пар` : ""} ·{" "}
                        <span className="text-green-700">вільний</span>
                      </div>
                    </div>
                    {added ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled
                        className="shrink-0 border-green-600 bg-green-50 text-green-700 disabled:opacity-100"
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Додано
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => addLot(lot)}
                        className="shrink-0 bg-green-600 text-white hover:bg-green-700"
                      >
                        Додати
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addGeneral}
              className={`inline-flex items-center gap-1 text-left text-sm font-medium underline-offset-2 hover:underline ${
                addedGeneral
                  ? "text-green-700"
                  : "text-gray-500 hover:text-green-700"
              }`}
            >
              {addedGeneral && <Check className="h-4 w-4 shrink-0" />}
              {addedGeneral
                ? "Додано як загальну позицію — додати ще мішок"
                : "Додати як загальну позицію (без лота)"}
            </button>
          </>
        )}

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
