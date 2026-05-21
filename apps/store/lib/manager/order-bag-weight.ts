/**
 * Блок «Замовлення» — Підбір через прайс (кількість мішків).
 *
 * У старому 1С менеджер у документі «Заказ» додавав товар і вказував
 * **кількість мішків** (а не конкретний лот), а програма розраховувала вагу
 * позиції як `середня вага мішка × кількість мішків`. Конкретний лот у
 * замовлення не пишеться — центральна 1С не приймає такий формат, тож позиції
 * завжди «загальні» (`lotId = null`).
 *
 * Тут — чисті (без I/O) функції розрахунку:
 *  - `averageBagWeight(product)` — середня вага одного мішка товару;
 *  - `bagWeightForQuantity(product, bags)` — сумарна вага позиції.
 *
 * Джерело середньої ваги (за пріоритетом):
 *  1. `Product.averageWeight` (поле з 1С);
 *  2. середнє арифметичне `Lot.weight` по наявних лотах товару (якщо передані);
 *  3. розумний дефолт `DEFAULT_BAG_WEIGHT_KG` (як робив 1С — ~20 кг).
 */

/** Дефолтна вага мішка коли немає ні averageWeight, ні лотів (як у 1С). */
export const DEFAULT_BAG_WEIGHT_KG = 20;

/** Підмножина товару, потрібна для розрахунку ваги мішка. */
export interface BagWeightProduct {
  averageWeight: number | null;
}

/** Підмножина лота для fallback-розрахунку середньої ваги. */
export interface BagWeightLot {
  weight: number;
}

/**
 * Повертає середню вагу **одного** мішка товару, кг.
 *
 * @param product — товар (поле `averageWeight`).
 * @param lots    — наявні лоти товару (опційно, для fallback по середньому).
 */
export function averageBagWeight(
  product: BagWeightProduct,
  lots?: BagWeightLot[],
): number {
  // 1. Поле з 1С.
  if (
    typeof product.averageWeight === "number" &&
    Number.isFinite(product.averageWeight) &&
    product.averageWeight > 0
  ) {
    return product.averageWeight;
  }

  // 2. Середнє по лотах товару.
  if (Array.isArray(lots) && lots.length > 0) {
    const valid = lots.filter((l) => Number.isFinite(l.weight) && l.weight > 0);
    if (valid.length > 0) {
      const sum = valid.reduce((acc, l) => acc + l.weight, 0);
      const avg = sum / valid.length;
      if (avg > 0) return roundWeight(avg);
    }
  }

  // 3. Розумний дефолт (як 1С).
  return DEFAULT_BAG_WEIGHT_KG;
}

/**
 * Сумарна вага позиції = середня вага мішка × кількість мішків.
 *
 * @param product — товар (для середньої ваги мішка).
 * @param bags    — кількість мішків (ціле ≥ 1; нижче 1 трактується як 1).
 * @param lots    — наявні лоти товару (опційно, fallback середньої ваги).
 */
export function bagWeightForQuantity(
  product: BagWeightProduct,
  bags: number,
  lots?: BagWeightLot[],
): number {
  const count = Number.isFinite(bags) && bags >= 1 ? Math.floor(bags) : 1;
  const perBag = averageBagWeight(product, lots);
  return roundWeight(perBag * count);
}

/** Округлення ваги до 3 знаків (грами) — уникаємо float-шуму. */
function roundWeight(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}
