/**
 * Утиліти кроку ціни за кг (€) для модалки «Підбір» замовлення.
 *
 * У формі замовлення менеджер може коригувати ціну за кг кратно **0,05 €**
 * (stepper +/− та ручний ввід округлюється до 0,05). Винесено окремо як чисту
 * (без I/O) логіку, щоб покрити тестами та не дублювати у UI.
 */

/** Крок ціни за кг (€). */
export const PRICE_STEP = 0.05;

/** Округлення float до копійок, щоб уникнути шуму типу 0.30000000004. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Округлює довільне значення ціни до найближчого кратного `PRICE_STEP`.
 * Від'ємні значення затискаються у 0.
 */
export function roundToStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return round2(Math.round(value / PRICE_STEP) * PRICE_STEP);
}

/** Збільшує ціну на один крок (вгору до кратного PRICE_STEP). */
export function stepUp(value: number): number {
  const base = roundToStep(value);
  return round2(base + PRICE_STEP);
}

/** Зменшує ціну на один крок (вниз, не нижче 0). */
export function stepDown(value: number): number {
  const base = roundToStep(value);
  return round2(Math.max(0, base - PRICE_STEP));
}
