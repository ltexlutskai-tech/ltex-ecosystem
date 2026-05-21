"use client";

import { Trash2 } from "lucide-react";
import { Input } from "@ltex/ui";
import { bagWeightForQuantity } from "@/lib/manager/order-bag-weight";
import { lineTotalEur, type SaleItemDraft } from "./sale-types";

/**
 * Позиції реалізації у стилі проекту: кожна позиція — картка-рядок з назвою
 * товара, кількістю мішків, ціною за кг та сумою. У Реалізації (на відміну
 * від Замовлень) **кроку ціни 0,05 немає** — ціна за кг вводиться вільно.
 *
 * Рядок (1С): редагована Ціна за кг + Кількість (мішків); read-only
 * Ціна = ціна/кг × вага, Сума = Ціна × кількість.
 *
 * Зміна кількості мішків перераховує вагу (`bagWeightForQuantity`) і суму;
 * зміна ціни за кг перераховує суму. Лоти, додані через скан ШК, мають
 * фіксовану вагу мішка — при зміні мішків вага масштабується пропорційно.
 */
export function SaleItemsEditor({
  items,
  onChange,
}: {
  items: SaleItemDraft[];
  onChange: (next: SaleItemDraft[]) => void;
}) {
  function updateRow(uid: string, next: SaleItemDraft): void {
    onChange(items.map((i) => (i.uid === uid ? next : i)));
  }
  function removeRow(uid: string): void {
    onChange(items.filter((i) => i.uid !== uid));
  }

  /** Перерахунок ваги/суми при зміні кількості мішків. */
  function changeBags(draft: SaleItemDraft, bags: number): void {
    const quantity = Math.max(1, Math.floor(bags) || 1);
    // Лот зі скану несе вагу одного мішка → масштабуємо за к-стю; інакше
    // (загальна позиція з підбору) — середня вага мішка товару × мішки.
    let weight: number;
    if (draft.lotId) {
      const perBag = draft.quantity > 0 ? draft.weight / draft.quantity : 0;
      weight = Math.round(perBag * quantity * 1000) / 1000;
    } else if (draft.product) {
      weight = bagWeightForQuantity(
        { averageWeight: draft.product.averageWeight },
        quantity,
      );
    } else {
      weight = draft.weight;
    }
    const priceEur = lineTotalEur(draft.pricePerKg, weight, 1);
    updateRow(draft.uid, { ...draft, quantity, weight, priceEur });
  }

  /** Зміна ціни за кг — перераховує суму (ціна/кг × вага × мішки). */
  function changeUnitPrice(draft: SaleItemDraft, pricePerKg: number): void {
    const unit = Math.max(0, pricePerKg);
    const priceEur = lineTotalEur(unit, draft.weight, draft.quantity);
    updateRow(draft.uid, { ...draft, pricePerKg: unit, priceEur });
  }

  const populated = items.filter((i) => i.product);

  if (populated.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
        Поки немає позицій. Відскануйте ШК або скористайтесь «Підбір товарів».
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {populated.map((draft, index) => {
        // Ціна = ціна/кг × вага одного мішка (read-only довідка).
        const perBagWeight =
          draft.quantity > 0 ? draft.weight / draft.quantity : draft.weight;
        const pricePerBag =
          Math.round(draft.pricePerKg * perBagWeight * 100) / 100;
        return (
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
                  {draft.barcode ? (
                    <>
                      <span className="mx-1.5 text-gray-300">·</span>
                      <span className="font-mono">ШК {draft.barcode}</span>
                    </>
                  ) : null}
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
                    value={draft.quantity}
                    onChange={(e) => changeBags(draft, Number(e.target.value))}
                    className="h-9 w-20 text-right text-sm"
                  />
                </div>

                {/* Ціна за кг (вільний ввід — без кроку) */}
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Ціна за кг, €
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label="Ціна за кг"
                    value={draft.pricePerKg}
                    onChange={(e) =>
                      changeUnitPrice(draft, Number(e.target.value))
                    }
                    className="h-9 w-24 rounded-md border border-gray-300 px-2 text-right text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                {/* Ціна (read-only = ціна/кг × вага мішка) */}
                <div className="min-w-[4.5rem] pb-1 text-right">
                  <div className="text-xs text-gray-400">Ціна</div>
                  <div className="text-sm text-gray-700">
                    {pricePerBag.toFixed(2)} €
                  </div>
                </div>

                {/* Сума (read-only = Ціна × мішки) */}
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
        );
      })}
    </ul>
  );
}
