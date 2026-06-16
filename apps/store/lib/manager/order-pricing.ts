/**
 * Блок «Замовлення» — Етап 1. Чиста логіка «ціна за типом цін».
 *
 * У 1С при зміні типу цін у документі «Заказ» перераховуються ціни всіх
 * рядків товарів. Тут — чиста (без I/O) функція, що для одного товару й
 * обраного типу цін повертає **одиничну** ціну (за кг / за шт-пару) з набору
 * `Price[]` цього товару, та функція перерахунку рядка (одинична × вага).
 *
 * Зв'язок типу цін з ціною: `MgrPriceType.code` (наприклад `wholesale`,
 * `small_wholesale`, `retail`, `akciya`) === `Price.priceType`. Тобто ціна
 * товару за обраним типом — це `Price.amount` запису з відповідним
 * `priceType`. Якщо запису немає — fallback на базову (`wholesale`),
 * далі — на будь-яку наявну, інакше `null` (менеджер вводить руками).
 *
 * Лінія замовлення зберігає `priceEur` як **сумарну** ціну рядка
 * (як `lot.priceEur` — total), тож для товару total = одинична × вага
 * (узгоджено з `AddProductToCartButton` із S60).
 */

import { BASE_PRICE_TYPE } from "./prices";

/** Запис ціни товара (підмножина `Price`). */
export interface PriceEntry {
  priceType: string;
  amount: number;
  currency?: string;
}

/**
 * Повертає **одиничну** ціну товара (за кг / за шт) для обраного типу цін.
 *
 * Пріоритет:
 *   1. точний збіг `priceType === priceTypeCode`;
 *   2. базова `wholesale`;
 *   3. перша наявна ціна;
 *   4. `null` — ціни немає (менеджер вводить руками).
 *
 * @param prices       — усі записи `Price` товара.
 * @param priceTypeCode — `MgrPriceType.code` обраного типу цін (або null/"").
 */
export function unitPriceForType(
  prices: PriceEntry[],
  priceTypeCode: string | null | undefined,
): number | null {
  if (!Array.isArray(prices) || prices.length === 0) return null;

  if (priceTypeCode) {
    const exact = prices.find((p) => p.priceType === priceTypeCode);
    if (exact) return exact.amount;
  }

  const base = prices.find((p) => p.priceType === BASE_PRICE_TYPE);
  if (base) return base.amount;

  return prices[0]?.amount ?? null;
}

/**
 * Перераховує **сумарну** ціну рядка (`priceEur`) для обраного типу цін.
 *
 * total = одинична_ціна(тип) × вага. Якщо одиничної ціни немає — повертає
 * `fallback` (поточну ціну рядка, щоб не обнуляти ручний ввід).
 *
 * @param prices        — записи `Price` товара рядка.
 * @param priceTypeCode — код обраного типу цін.
 * @param weight        — вага рядка (кг або к-сть одиниць).
 * @param fallback      — ціна, що лишається коли немає прайсу (дефолт 0).
 */
export function recalcLinePrice(
  prices: PriceEntry[],
  priceTypeCode: string | null | undefined,
  weight: number,
  fallback = 0,
): number {
  const unit = unitPriceForType(prices, priceTypeCode);
  if (unit === null) return fallback;
  const total = unit * (weight > 0 ? weight : 0);
  // Округлення до копійок, щоб уникнути float-шуму.
  return Math.round(total * 100) / 100;
}

// ─── Фіксовані типи цін продажу (відв'язані від MgrPriceType) ────────────────
//
// `MgrPriceType.code` (1С `_Code`) НЕ дорівнює `wholesale`/`akciya`, тому
// дропдан «Тип цін» з довідника MgrPriceType не давав підставити акційну ціну
// (падав у wholesale-fallback). У формах Замовлення/Реалізація використовуємо
// дві фіксовані опції з кодами `Price.priceType`, що реально є у товара.

/** Фіксований тип цін продажу (код = `Price.priceType`). */
export interface SellingPriceType {
  code: string;
  label: string;
}

/** Дві опції дропдана «Тип цін»: продажна (опт) та акційна. */
export const SELLING_PRICE_TYPES: SellingPriceType[] = [
  { code: "wholesale", label: "Ціна продажу" },
  { code: "akciya", label: "Акційна" },
];

/**
 * Авто-ціна товара при додаванні рядка: **акційна якщо є**, інакше продажна
 * (`wholesale`), інакше перша наявна. Повертає одиничну ціну (€/кг або €/шт)
 * та прапор `isAkciya` (чи це акційна ціна — для підсвічування рядка).
 *
 * @param prices — усі записи `Price` товара.
 */
export function autoUnitPrice(prices: PriceEntry[]): {
  unit: number | null;
  isAkciya: boolean;
} {
  if (!Array.isArray(prices) || prices.length === 0) {
    return { unit: null, isAkciya: false };
  }
  const akc = prices.find((p) => p.priceType === "akciya");
  if (akc) return { unit: akc.amount, isAkciya: true };
  const ws = prices.find((p) => p.priceType === "wholesale");
  if (ws) return { unit: ws.amount, isAkciya: false };
  return { unit: prices[0]?.amount ?? null, isAkciya: false };
}
