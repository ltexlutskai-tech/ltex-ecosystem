/**
 * Авто-заповнення «Місць відправлення» завдання складу з габаритів картки товару.
 *
 * Кожна позиція завдання (лот/мішок) — це фізичне місце. Якщо в картці товару
 * задані габарити за замовчуванням, ми пропонуємо складу готові місця (вага з
 * позиції, розміри з товару, «ручна обробка» для мішків). Склад лише перевіряє
 * й за потреби коригує/об'єднує. Якщо жодна позиція не має ані габаритів, ані
 * пакування «мішок» — повертаємо порожньо (редактор лишається з ручним вводом).
 */

export interface ItemForSeatSuggest {
  weight: number;
  packaging: string | null;
  defaultLengthCm: number | null;
  defaultWidthCm: number | null;
  defaultHeightCm: number | null;
  defaultSeatWeightKg?: number | null;
}

export interface SuggestedSeat {
  weight: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  manualHandling: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pos(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Будує пропоновані місця відправлення — одне на позицію завдання.
 * Порожній масив, коли пропонувати нічого (немає ані габаритів, ані мішків).
 */
export function buildSuggestedSeats(
  items: ItemForSeatSuggest[],
): SuggestedSeat[] {
  const seats = items.map((it) => {
    const w = pos(it.weight) || pos(it.defaultSeatWeightKg);
    return {
      weight: round2(w),
      lengthCm: pos(it.defaultLengthCm),
      widthCm: pos(it.defaultWidthCm),
      heightCm: pos(it.defaultHeightCm),
      manualHandling: it.packaging === "bag",
    };
  });

  const useful = seats.some(
    (s) => s.lengthCm || s.widthCm || s.heightCm || s.manualHandling,
  );
  return useful ? seats : [];
}
