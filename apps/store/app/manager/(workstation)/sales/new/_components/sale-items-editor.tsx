"use client";

import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { bagWeightForQuantity } from "@/lib/manager/order-bag-weight";
import {
  lineTotalEur,
  parseNumericInput,
  repeatPriceForProduct,
  sanitizeNumericText,
  type SaleItemDraft,
} from "./sale-types";

/**
 * Інлайнове числове поле з локальним рядковим станом (Fix 5).
 *
 * Тримає **рядок** (дозволяє порожнє / частковий ввід «0.» / «»), приймає
 * крапку АБО кому, прибирає провідні нулі. На кожну зміну емітить розпарсене
 * число батьку для розрахунків. Так не «прилипає» провідний нуль і поле
 * можна очистити повністю.
 */
function NumericField({
  value,
  onValueChange,
  ariaLabel,
  className,
}: {
  /** Поточне числове значення з draft (синхронізує при зовнішніх змінах). */
  value: number;
  /** Викликається з розпарсеним числом на кожну зміну тексту. */
  onValueChange: (next: number) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [text, setText] = useState<string>(() =>
    value > 0 ? String(value) : "",
  );

  // Підхоплюємо зовнішні зміни (перерахунок типу цін / «Повторити ціну»), але
  // не перетираємо частковий ввід, що дає те саме число (напр. «0.» → 0).
  useEffect(() => {
    if (parseNumericInput(text) !== value) {
      setText(value > 0 ? String(value) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => {
        const next = sanitizeNumericText(e.target.value);
        setText(next);
        onValueChange(parseNumericInput(next));
      }}
      className={className}
    />
  );
}

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
 *
 * «Повторити ціну» (Fix 4 / 1С `ПовторитьЦену`) копіює ціну за кг цього рядка
 * на всі рядки того самого товару й перераховує їхні суми.
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
    const priceEur = lineTotalEur(draft.pricePerKg, weight);
    updateRow(draft.uid, { ...draft, quantity, weight, priceEur });
  }

  /** Зміна ціни за кг — перераховує суму; ручний ввід знімає прапор «Акція». */
  function changeUnitPrice(draft: SaleItemDraft, pricePerKg: number): void {
    const unit = Math.max(0, pricePerKg);
    const priceEur = lineTotalEur(unit, draft.weight);
    updateRow(draft.uid, {
      ...draft,
      pricePerKg: unit,
      priceEur,
      isAkciya: false,
    });
  }

  /** Повторити ціну рядка на всі рядки того самого товару (1С ПовторитьЦену). */
  function repeatPrice(uid: string): void {
    onChange(repeatPriceForProduct(items, uid));
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="w-8 px-2 py-2 font-medium">№</th>
            <th className="px-2 py-2 font-medium">Товар</th>
            <th className="w-24 px-2 py-2 text-right font-medium">Мішків</th>
            <th className="w-32 px-2 py-2 text-right font-medium">
              Ціна/кг, €
            </th>
            <th className="w-24 px-2 py-2 text-right font-medium">Ціна, €</th>
            <th className="w-28 px-2 py-2 text-right font-medium">Сума, €</th>
            <th className="w-10 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {populated.map((draft, index) => {
            // Чи є інші рядки того самого товару (показуємо «Повторити ціну»).
            const sameProductCount = populated.filter(
              (r) => r.product?.id === draft.product?.id,
            ).length;
            // Ціна = ціна/кг × вага одного мішка (read-only довідка).
            const perBagWeight =
              draft.quantity > 0 ? draft.weight / draft.quantity : draft.weight;
            const pricePerBag =
              Math.round(draft.pricePerKg * perBagWeight * 100) / 100;
            return (
              <tr
                key={draft.uid}
                className="border-b align-top last:border-b-0 hover:bg-gray-50"
              >
                <td className="px-2 py-2 text-xs text-gray-400">{index + 1}</td>
                <td className="px-2 py-2">
                  <div className="font-medium text-gray-900">
                    {draft.product?.name}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {draft.product?.articleCode
                      ? `Арт. ${draft.product.articleCode}`
                      : "Арт. —"}
                    <span className="mx-1 text-gray-300">·</span>≈{" "}
                    {draft.weight.toFixed(1)} кг
                    {draft.barcode ? (
                      <>
                        <span className="mx-1 text-gray-300">·</span>
                        <span className="font-mono">ШК {draft.barcode}</span>
                      </>
                    ) : null}
                  </div>
                </td>
                <td className="px-2 py-2 text-right">
                  <NumericField
                    value={draft.quantity}
                    ariaLabel="Кількість мішків"
                    onValueChange={(n) => changeBags(draft, n)}
                    className="h-8 w-20 rounded-md border border-gray-300 px-2 text-right text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <NumericField
                      value={draft.pricePerKg}
                      ariaLabel="Ціна за кг"
                      onValueChange={(n) => changeUnitPrice(draft, n)}
                      className="h-8 w-20 rounded-md border border-gray-300 px-2 text-right text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    {sameProductCount > 1 && (
                      <button
                        type="button"
                        onClick={() => repeatPrice(draft.uid)}
                        title="Повторити ціну для всіх рядків цього товару"
                        aria-label="Повторити ціну"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:border-green-400 hover:text-green-600"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 text-right text-gray-700">
                  {pricePerBag.toFixed(2)}
                </td>
                <td className="px-2 py-2 text-right">
                  <span
                    className={`font-semibold ${
                      draft.isAkciya ? "text-green-700" : "text-gray-900"
                    }`}
                  >
                    {draft.priceEur.toFixed(2)}
                  </span>
                  {draft.isAkciya && (
                    <span className="ml-1 inline-flex items-center rounded-sm bg-green-100 px-1 py-0.5 text-[10px] font-medium text-green-700">
                      Акція
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(draft.uid)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Видалити позицію"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
