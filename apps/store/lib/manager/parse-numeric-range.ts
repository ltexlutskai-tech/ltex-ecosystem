/**
 * Витягує числовий діапазон (min/max) з тексту на кшталт «40», «40-50»,
 * «40–50 шт». Повертає null, якщо чисел немає. Використовується у формі
 * створення товару, щоб нові товари одразу потрапляли у слайдери фільтрів
 * сайту (units_per_kg_*, unit_weight_*), які працюють по числових колонках.
 *
 * Чиста функція (без I/O) — окремий модуль, бо `actions.ts` має `"use server"`,
 * де експортувати можна лише async-функції.
 */
export function parseNumericRange(
  raw: string | null,
): { min: number; max: number } | null {
  if (!raw) return null;
  const nums = (raw.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) =>
    Number.parseFloat(n.replace(",", ".")),
  );
  const valid = nums.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  return { min, max };
}
