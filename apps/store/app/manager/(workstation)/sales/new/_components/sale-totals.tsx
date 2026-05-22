"use client";

import type { SaleItemDraft } from "./sale-types";

/**
 * Підсумки реалізації: к-сть позицій · мішків + сума EUR/UAH (за курсом
 * документа). Окремо від `OrderTotals`, бо `SaleItemDraft` несе власний shape.
 */
export function SaleTotals({
  items,
  exchangeRateEur,
}: {
  items: SaleItemDraft[];
  exchangeRateEur: number;
}) {
  const populated = items.filter((i) => i.product);
  const totalEur = populated.reduce((sum, i) => sum + (i.priceEur || 0), 0);
  const totalUah = totalEur * exchangeRateEur;
  const itemsCount = populated.length;
  const bagsCount = populated.reduce((sum, i) => sum + (i.quantity || 0), 0);

  return (
    <div className="rounded-lg border bg-gray-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="text-sm text-gray-600">
          {itemsCount} {pluralize(itemsCount, "позиція", "позиції", "позицій")}{" "}
          · {bagsCount} {pluralize(bagsCount, "мішок", "мішки", "мішків")}
          {exchangeRateEur > 0 ? (
            <span className="ml-2 text-xs text-gray-400">
              курс EUR→UAH: {exchangeRateEur.toFixed(2)}
            </span>
          ) : null}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">
            {Math.round(totalUah).toLocaleString("uk-UA")} ₴
          </div>
          <div className="text-sm text-gray-500">{totalEur.toFixed(2)} €</div>
        </div>
      </div>
    </div>
  );
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
