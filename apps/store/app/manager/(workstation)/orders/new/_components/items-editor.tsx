"use client";

import { useState } from "react";
import { Trash2, Minus, Plus } from "lucide-react";
import { Input } from "@ltex/ui";
import { bagWeightForQuantity } from "@/lib/manager/order-bag-weight";
import { PRICE_STEP, stepUp, stepDown } from "@/lib/manager/price-step";
import type { OrderItemDraft } from "./types";

/** Порожній рядок-чернетка позиції (товар ще не обрано). */
function emptyDraft(): OrderItemDraft {
  return {
    uid: `i-${Math.random().toString(36).slice(2, 10)}`,
    product: null,
    lot: null,
    bindToLot: false,
    quantity: 1,
    weight: 0,
    priceEur: 0,
    unitPriceEur: 0,
  };
}

/**
 * Позиції замовлення у стилі проекту: кожна позиція — охайна картка-рядок з
 * назвою товару, кількістю мішків, ціною за кг (stepper 0,05 €) та сумою.
 * Конкретний лот не вибирається — позиції загальні (1С обере вільний лот).
 *
 * Зміна кількості мішків перераховує вагу (`bagWeightForQuantity`) і суму;
 * зміна ціни за кг перераховує суму.
 */
export function ItemsEditor({
  items,
  onChange,
}: {
  items: OrderItemDraft[];
  onChange: (next: OrderItemDraft[]) => void;
}) {
  // Сирий текст полів вводу per-row (uid → текст) під час редагування. Дозволяє
  // очистити поле (без миттєвого «прилипання» до 1/0). Undefined = показуємо
  // числове значення рядка. Коммітимо у числове значення на blur/зміні.
  const [bagsText, setBagsText] = useState<Record<string, string>>({});
  const [priceText, setPriceText] = useState<Record<string, string>>({});

  function updateRow(uid: string, next: OrderItemDraft): void {
    onChange(items.map((i) => (i.uid === uid ? next : i)));
  }
  function removeRow(uid: string): void {
    onChange(items.filter((i) => i.uid !== uid));
  }

  /** Текст у полі «Мішків» — сирий ввід або числове значення рядка. */
  function bagsTextFor(draft: OrderItemDraft): string {
    return bagsText[draft.uid] ?? String(draft.quantity);
  }

  /** Парсить сирий текст мішків: порожнє/NaN/<1 → 1. */
  function parseBags(raw: string | undefined, fallback: number): number {
    if (raw === undefined) return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
  }

  /** Текст у полі «Ціна за кг» — сирий ввід або числове значення рядка. */
  function priceTextFor(draft: OrderItemDraft): string {
    return priceText[draft.uid] ?? String(draft.unitPriceEur);
  }

  /** Парсить сирий текст ціни: порожнє/NaN/<0 → 0. */
  function parsePrice(raw: string | undefined, fallback: number): number {
    if (raw === undefined) return fallback;
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }

  /** Прибирає сирий текст ціни рядка → показуємо числове значення draft. */
  function clearPriceText(uid: string): void {
    setPriceText((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }

  /** Перерахунок ваги/суми при зміні кількості мішків. */
  function changeBags(draft: OrderItemDraft, bags: number): void {
    if (!draft.product) {
      updateRow(draft.uid, { ...draft, quantity: Math.max(1, bags) });
      return;
    }
    const quantity = Math.max(1, Math.floor(bags) || 1);
    const weight = bagWeightForQuantity(
      { averageWeight: draft.product.averageWeight },
      quantity,
    );
    const priceEur = Math.round(draft.unitPriceEur * weight * 100) / 100;
    updateRow(draft.uid, { ...draft, quantity, weight, priceEur });
  }

  /** Зміна ціни за кг — перераховує суму. */
  function changeUnitPrice(draft: OrderItemDraft, unitPriceEur: number): void {
    const unit = Math.max(0, unitPriceEur);
    const priceEur = Math.round(unit * draft.weight * 100) / 100;
    updateRow(draft.uid, { ...draft, unitPriceEur: unit, priceEur });
  }

  const populated = items.filter((i) => i.product);

  if (populated.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
        Поки немає позицій. Натисніть «Підбір товарів», щоб додати їх.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {populated.map((draft, index) => (
        <li
          key={draft.uid}
          className="rounded-lg border bg-white p-4 transition-shadow hover:shadow-sm"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            {/* Назва + мета */}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-gray-400">{index + 1}.</span>
                <span className="font-medium text-gray-900">
                  {draft.product?.name}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {draft.product?.articleCode
                  ? `Артикул: ${draft.product.articleCode}`
                  : "Артикул: —"}
                <span className="mx-1.5 text-gray-300">·</span>≈{" "}
                {draft.weight.toFixed(1)} кг
              </div>
            </div>

            {/* Контроли + видалення */}
            <div className="flex flex-wrap items-end gap-4">
              {/* Мішки */}
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Мішків
                </label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  aria-label="Кількість мішків"
                  value={bagsTextFor(draft)}
                  onChange={(e) => {
                    const text = e.target.value;
                    setBagsText((prev) => ({ ...prev, [draft.uid]: text }));
                    changeBags(draft, parseBags(text, draft.quantity));
                  }}
                  onBlur={() =>
                    setBagsText((prev) => {
                      const next = { ...prev };
                      delete next[draft.uid];
                      return next;
                    })
                  }
                  className="h-9 w-20 text-right text-sm"
                />
              </div>

              {/* Ціна за кг (stepper 0,05) */}
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Ціна за кг, €
                </label>
                <div className="inline-flex items-center">
                  <button
                    type="button"
                    aria-label="Зменшити ціну"
                    onClick={() => {
                      changeUnitPrice(draft, stepDown(draft.unitPriceEur));
                      clearPriceText(draft.uid);
                    }}
                    className="inline-flex h-9 w-8 items-center justify-center rounded-l-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    step={PRICE_STEP}
                    aria-label="Ціна за кг"
                    value={priceTextFor(draft)}
                    onChange={(e) => {
                      const text = e.target.value;
                      setPriceText((prev) => ({ ...prev, [draft.uid]: text }));
                      changeUnitPrice(
                        draft,
                        parsePrice(text, draft.unitPriceEur),
                      );
                    }}
                    onBlur={() => clearPriceText(draft.uid)}
                    className="h-9 w-20 border-y border-gray-300 px-2 text-center text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <button
                    type="button"
                    aria-label="Збільшити ціну"
                    onClick={() => {
                      changeUnitPrice(draft, stepUp(draft.unitPriceEur));
                      clearPriceText(draft.uid);
                    }}
                    className="inline-flex h-9 w-8 items-center justify-center rounded-r-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Сума */}
              <div className="min-w-[5rem] pb-1 text-right">
                <div className="text-xs text-gray-400">Сума</div>
                <div className="text-base font-semibold text-gray-900">
                  {draft.priceEur.toFixed(2)} €
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeRow(draft.uid)}
                className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Видалити позицію"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export { emptyDraft };
