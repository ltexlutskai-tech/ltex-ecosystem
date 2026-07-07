/**
 * Блок «Замовлення» — Підбір через прайс (кількість мішків).
 *
 * У старому 1С менеджер у документі «Заказ» додавав товар і вказував
 * **кількість мішків** (а не конкретний лот), а програма розраховувала вагу
 * позиції як `середня вага мішка × кількість мішків`. Конкретний лот у
 * замовлення не пишеться — позиції завжди «загальні» (`lotId = null`).
 *
 * Правило ваги (7.3, за рішенням user): беремо **середню вагу мішка з опису
 * товару** (`Product.averageWeight`); якщо її немає або значення неправдоподібне
 * (наприклад, 726 кг — вага складського залишку, а не мішка) — дефолт 20 кг.
 * Середнє по лотах НЕ використовується.
 */

/** Дефолтна вага мішка коли немає валідного averageWeight (як у 1С). */
export const DEFAULT_BAG_WEIGHT_KG = 20;

/**
 * Верхня межа правдоподібної ваги ОДНОГО мішка, кг. Значення понад це —
 * сміттєві дані (вага залишку/лота замість мішка) → ігноруємо, дефолт 20.
 */
export const MAX_BAG_WEIGHT_KG = 100;

/** Підмножина товару, потрібна для розрахунку ваги мішка. */
export interface BagWeightProduct {
  averageWeight: number | null;
}

/**
 * Повертає середню вагу **одного** мішка товару, кг:
 * валідний `Product.averageWeight` (0 < w ≤ 100) або дефолт 20 кг.
 */
export function averageBagWeight(product: BagWeightProduct): number {
  const w = product.averageWeight;
  if (
    typeof w === "number" &&
    Number.isFinite(w) &&
    w > 0 &&
    w <= MAX_BAG_WEIGHT_KG
  ) {
    return w;
  }
  return DEFAULT_BAG_WEIGHT_KG;
}

/**
 * Сумарна вага позиції = середня вага мішка × кількість мішків.
 *
 * @param product — товар (для середньої ваги мішка).
 * @param bags    — кількість мішків (ціле ≥ 1; нижче 1 трактується як 1).
 */
export function bagWeightForQuantity(
  product: BagWeightProduct,
  bags: number,
): number {
  const count = Number.isFinite(bags) && bags >= 1 ? Math.floor(bags) : 1;
  const perBag = averageBagWeight(product);
  return roundWeight(perBag * count);
}

/** Округлення ваги до 3 знаків (грами) — уникаємо float-шуму. */
function roundWeight(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}
