"use client";

import { Fragment } from "react";
import { X } from "lucide-react";
import { Input } from "@ltex/ui";
import { bagWeightForQuantity } from "@/lib/manager/order-bag-weight";
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
 * Таблиця позицій замовлення у стилі 1С: кожен товар — два візуальні
 * під-рядки. Зверху: Номенклатура · Кіль-ть (мішків) · Ціна (сума €).
 * Знизу: Характеристика (лот — порожньо, бо не фіксуємо) · Ціна за кг · Сума.
 *
 * Зміна кількості мішків перераховує вагу (`bagWeightForQuantity`) і суму
 * (ціна_за_кг × вага). Конкретний лот не вибирається — позиції загальні.
 */
export function ItemsEditor({
  items,
  onChange,
}: {
  items: OrderItemDraft[];
  onChange: (next: OrderItemDraft[]) => void;
}) {
  function updateRow(uid: string, next: OrderItemDraft): void {
    onChange(items.map((i) => (i.uid === uid ? next : i)));
  }
  function removeRow(uid: string): void {
    onChange(items.filter((i) => i.uid !== uid));
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

  /** Зміна ціни за кг вручну — перераховує суму. */
  function changeUnitPrice(draft: OrderItemDraft, unitPriceEur: number): void {
    const unit = Math.max(0, unitPriceEur);
    const priceEur = Math.round(unit * draft.weight * 100) / 100;
    updateRow(draft.uid, { ...draft, unitPriceEur: unit, priceEur });
  }

  const populated = items.filter((i) => i.product);

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 font-medium">
                Номенклатура / Характеристика
              </th>
              <th className="px-3 py-2 text-right font-medium">
                Кіль-ть / Ціна за кг
              </th>
              <th className="px-3 py-2 text-right font-medium">Ціна / Сума</th>
              <th className="px-3 py-2 text-center font-medium">Нагадування</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {populated.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-sm text-gray-500"
                >
                  Поки немає позицій. Натисніть «Підбір» щоб додати товари.
                </td>
              </tr>
            )}
            {populated.map((draft, index) => (
              <Fragment key={draft.uid}>
                {/* ── Верхній під-рядок: Номенклатура · Кіль-ть · Ціна ── */}
                <tr className="border-t">
                  <td className="px-3 pt-2 align-top">
                    <span className="mr-2 text-xs text-gray-400">
                      {index + 1}.
                    </span>
                    <span className="font-medium text-gray-900">
                      {draft.product?.name}
                    </span>
                  </td>
                  <td className="px-3 pt-2 text-right align-top">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        aria-label="Кількість мішків"
                        value={draft.quantity}
                        onChange={(e) =>
                          changeBags(draft, Number(e.target.value))
                        }
                        className="h-8 w-20 text-right text-sm"
                      />
                      <span className="text-xs text-gray-400">міш.</span>
                    </div>
                  </td>
                  <td className="px-3 pt-2 text-right align-top font-medium text-gray-900">
                    {draft.priceEur.toFixed(2)} €
                  </td>
                  <td className="px-3 pt-2 text-center align-top" rowSpan={2}>
                    <input
                      type="checkbox"
                      disabled
                      title="Нагадування — у розробці (механізм приходу)"
                      className="h-4 w-4 cursor-not-allowed rounded border-gray-300 opacity-40"
                    />
                  </td>
                  <td className="px-2 pt-2 align-top" rowSpan={2}>
                    <button
                      type="button"
                      onClick={() => removeRow(draft.uid)}
                      className="text-gray-400 hover:text-red-600"
                      aria-label="Видалити позицію"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                {/* ── Нижній під-рядок: Характеристика · Ціна за кг · Сума ── */}
                <tr className="border-b">
                  <td className="px-3 pb-2 pl-8 align-top text-xs text-gray-500">
                    {draft.product?.articleCode
                      ? `Артикул: ${draft.product.articleCode} · `
                      : ""}
                    Характеристика: —{" "}
                    <span className="text-gray-400">
                      (≈ {draft.weight.toFixed(1)} кг)
                    </span>
                  </td>
                  <td className="px-3 pb-2 text-right align-top">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label="Ціна за кг"
                        value={draft.unitPriceEur}
                        onChange={(e) =>
                          changeUnitPrice(draft, Number(e.target.value))
                        }
                        className="h-8 w-20 text-right text-sm"
                      />
                      <span className="text-xs text-gray-400">€/кг</span>
                    </div>
                  </td>
                  <td className="px-3 pb-2 text-right align-top text-xs text-gray-500">
                    Сума: {draft.priceEur.toFixed(2)} €
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { emptyDraft };
