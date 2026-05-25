"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Eye, Minus, Plus, Check } from "lucide-react";
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
import {
  PRICE_STEP,
  roundToStep,
  stepUp,
  stepDown,
} from "@/lib/manager/price-step";
import type { ProductSummary } from "./types";

/**
 * Модалка «Підбір» — прайс зі старого 1С. Менеджер шукає товар, вказує
 * **кількість мішків** та (за потреби) коригує **ціну за кг** кратно 0,05 €,
 * і додає позицію. Конкретний лот не вибирається — позиція завжди загальна.
 *
 * При «Додати» батьку повертається товар + кількість мішків + ціна за кг.
 * Якщо менеджер не чіпав ціну — передається прайсова за обраним типом цін.
 */
export function ProductPricePicker({
  open,
  onOpenChange,
  priceTypeCode,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Код обраного типу цін — для дефолту ціни за кг у списку. */
  priceTypeCode: string | null;
  /** Додати позицію: товар + кількість мішків + ціна за кг (lotId завжди null). */
  onAdd: (product: ProductSummary, bags: number, unitPriceEur: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(false);
  // Сирий текст полів вводу per-product (id → текст). Дозволяє очистити поле
  // під час редагування (без миттєвого «прилипання» до 0/1). Undefined = поле
  // ще не чіпали → показуємо дефолт (1 мішок / прайсова ціна).
  const [bagsTextByProduct, setBagsTextByProduct] = useState<
    Record<string, string>
  >({});
  const [priceTextByProduct, setPriceTextByProduct] = useState<
    Record<string, string>
  >({});
  // Які товари вже додані у цьому сеансі підбору — щоб кнопка «Додати»
  // перемикалась на «Додано» (модалка лишається відкритою для повторного
  // додавання мішків до тієї самої позиції).
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(
    new Set(),
  );
  const debouncedQuery = useDebouncedValue(query, 300);
  const abortRef = useRef<AbortController | null>(null);

  // Скидаємо стан при відкритті.
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setBagsTextByProduct({});
      setPriceTextByProduct({});
      setAddedProductIds(new Set());
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

  /** Текст у полі «Мішків» — сирий ввід або дефолт «1». */
  function bagsTextFor(id: string): string {
    return bagsTextByProduct[id] ?? "1";
  }

  /** Числове значення мішків для розрахунку: порожнє/NaN → 1. */
  function bagsValueFor(id: string): number {
    const raw = bagsTextByProduct[id];
    if (raw === undefined) return 1;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
  }

  /** Зберігає сирий текст поля «Мішків» (дозволяє порожнє під час вводу). */
  function setBagsText(id: string, text: string): void {
    setBagsTextByProduct((prev) => ({ ...prev, [id]: text }));
  }

  /** Текст у полі «Ціна за кг» — сирий ввід або дефолт прайсова. */
  function priceTextFor(product: ProductSummary): string {
    const raw = priceTextByProduct[product.id];
    if (raw !== undefined) return raw;
    const def = roundToStep(
      unitPriceForType(product.prices, priceTypeCode) ?? 0,
    );
    return String(def);
  }

  /** Числове значення ціни за кг для розрахунку: порожнє/NaN → 0. */
  function priceValueFor(product: ProductSummary): number {
    const raw = priceTextByProduct[product.id];
    if (raw === undefined) {
      return roundToStep(unitPriceForType(product.prices, priceTypeCode) ?? 0);
    }
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }

  /** Зберігає сирий текст поля «Ціна за кг» (дозволяє порожнє під час вводу). */
  function setPriceText(id: string, text: string): void {
    setPriceTextByProduct((prev) => ({ ...prev, [id]: text }));
  }

  /** Встановлює ціну за кг з числа (для stepper-кнопок) кратно 0,05. */
  function setPriceNumber(id: string, value: number): void {
    setPriceTextByProduct((prev) => ({
      ...prev,
      [id]: String(roundToStep(Math.max(0, value))),
    }));
  }

  function add(product: ProductSummary): void {
    onAdd(
      product,
      bagsValueFor(product.id),
      roundToStep(priceValueFor(product)),
    );
    setAddedProductIds((prev) => new Set(prev).add(product.id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Підбір товарів (прайс)</DialogTitle>
        </DialogHeader>

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

        <div className="max-h-[60vh] divide-y overflow-y-auto rounded-lg border bg-white">
          {loading && <div className="p-4 text-sm text-gray-500">Пошук…</div>}
          {!loading && debouncedQuery.length < 2 && (
            <div className="p-4 text-sm text-gray-400">
              Введіть мінімум 2 символи для пошуку.
            </div>
          )}
          {!loading && results.length === 0 && debouncedQuery.length >= 2 && (
            <div className="p-4 text-sm text-gray-500">Нічого не знайдено.</div>
          )}
          {results.map((p) => {
            const bags = bagsValueFor(p.id);
            const unit = priceValueFor(p);
            const added = addedProductIds.has(p.id);
            const hasPrice = unitPriceForType(p.prices, priceTypeCode) !== null;
            const previewWeight = bagWeightForQuantity(
              { averageWeight: p.averageWeight },
              bags,
            );
            const previewTotal = Math.round(unit * previewWeight * 100) / 100;
            return (
              <div
                key={p.id}
                className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"
              >
                {/* Інфо про товар + кнопка перегляду картки */}
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <a
                    href={`/manager/prices/${p.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Відкрити картку товару у новій вкладці"
                    className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:border-green-400 hover:text-green-600"
                    aria-label="Переглянути картку товару"
                  >
                    <Eye className="h-4 w-4" />
                  </a>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">
                      {p.name}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {p.articleCode ?? "—"}
                      {p.code1C ? ` · ${p.code1C}` : ""} ·{" "}
                      {p.priceUnit === "kg" ? "за кг" : "за шт"}
                      {hasPrice ? "" : " · ціна вручну"}
                      {p.averageWeight ? ` · ~${p.averageWeight} кг/міш.` : ""}
                    </div>
                  </div>
                </div>

                {/* Контроли: мішки · ціна за кг · сума · додати */}
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">
                      Мішків
                    </label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={bagsTextFor(p.id)}
                      onChange={(e) => setBagsText(p.id, e.target.value)}
                      onBlur={() =>
                        setBagsText(p.id, String(bagsValueFor(p.id)))
                      }
                      className="h-8 w-16 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-gray-500">
                      Ціна за кг, €
                    </label>
                    <div className="inline-flex items-center">
                      <button
                        type="button"
                        aria-label="Зменшити ціну"
                        onClick={() => setPriceNumber(p.id, stepDown(unit))}
                        className="inline-flex h-8 w-7 items-center justify-center rounded-l-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        step={PRICE_STEP}
                        aria-label="Ціна за кг"
                        value={priceTextFor(p)}
                        onChange={(e) => setPriceText(p.id, e.target.value)}
                        onBlur={() =>
                          setPriceText(
                            p.id,
                            String(roundToStep(priceValueFor(p))),
                          )
                        }
                        className="h-8 w-20 border-y border-gray-300 px-2 text-center text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                      <button
                        type="button"
                        aria-label="Збільшити ціну"
                        onClick={() => setPriceNumber(p.id, stepUp(unit))}
                        className="inline-flex h-8 w-7 items-center justify-center rounded-r-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="min-w-[5rem] pb-1 text-right">
                    <div className="text-xs text-gray-400">Сума</div>
                    <div className="text-sm font-semibold text-gray-800">
                      {previewTotal.toFixed(2)} €
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => add(p)}
                    className={
                      added
                        ? "border border-green-600 bg-green-50 text-green-700 hover:bg-green-100"
                        : "bg-green-600 text-white hover:bg-green-700"
                    }
                  >
                    {added ? (
                      <>
                        <Check className="mr-1 h-4 w-4" />
                        Додано
                      </>
                    ) : (
                      "Додати"
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
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
