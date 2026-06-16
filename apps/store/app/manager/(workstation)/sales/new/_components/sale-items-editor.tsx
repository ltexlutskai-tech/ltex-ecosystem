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
    const priceEur = lineTotalEur(draft.pricePerKg, weight, 1);
    updateRow(draft.uid, { ...draft, quantity, weight, priceEur });
  }

  /** Зміна ціни за кг — перераховує суму; ручний ввід знімає прапор «Акція». */
  function changeUnitPrice(draft: SaleItemDraft, pricePerKg: number): void {
    const unit = Math.max(0, pricePerKg);
    const priceEur = lineTotalEur(unit, draft.weight, draft.quantity);
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
    <ul className="space-y-3">
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
                  <NumericField
                    value={draft.quantity}
                    ariaLabel="Кількість мішків"
                    onValueChange={(n) => changeBags(draft, n)}
                    className="h-9 w-20 rounded-md border border-gray-300 px-2 text-right text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                {/* Ціна за кг (вільний ввід — без кроку) */}
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Ціна за кг, €
                  </label>
                  <div className="flex items-center gap-1">
                    <NumericField
                      value={draft.pricePerKg}
                      ariaLabel="Ціна за кг"
                      onValueChange={(n) => changeUnitPrice(draft, n)}
                      className="h-9 w-24 rounded-md border border-gray-300 px-2 text-right text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    {sameProductCount > 1 && (
                      <button
                        type="button"
                        onClick={() => repeatPrice(draft.uid)}
                        title="Повторити ціну для всіх рядків цього товару"
                        aria-label="Повторити ціну"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:border-green-400 hover:text-green-600"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    )}
                  </div>
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
                  <div
                    className={`text-base font-semibold ${
                      draft.isAkciya ? "text-green-700" : "text-gray-900"
                    }`}
                  >
                    {draft.priceEur.toFixed(2)} €
                  </div>
                  {draft.isAkciya && (
                    <span className="mt-0.5 inline-flex items-center rounded-sm bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
                      Акція
                    </span>
                  )}
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
