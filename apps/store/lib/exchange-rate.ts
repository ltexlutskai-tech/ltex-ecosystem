import { cache } from "react";
import { prisma } from "@ltex/db";

const FALLBACK_RATE = 43;

/**
 * Latest EUR → UAH rate from the ExchangeRate table (1С feed). Cached per
 * request via React `cache()` so multiple calls within one render share the
 * same DB query. Falls back to a static rate when the table is empty (dev
 * snapshots without rate seed data).
 */
export const getCurrentRate = cache(async (): Promise<number> => {
  try {
    const latest = await prisma.exchangeRate.findFirst({
      where: { currencyFrom: "EUR", currencyTo: "UAH" },
      orderBy: { date: "desc" },
    });
    return latest?.rate ?? FALLBACK_RATE;
  } catch {
    return FALLBACK_RATE;
  }
});

/**
 * EUR → UAH курс на конкретну дату (Фаза 4 — історичні курси).
 *
 * Бере НАЙБЛИЖЧИЙ курс із датою ≤ переданої (історичний курс «станом на дату
 * документа»). Якщо для дати ще немає жодного запису (дата раніше першого
 * курсу) — повертає найперший доступний курс (`> date`). Якщо ряд порожній —
 * `FALLBACK_RATE` (43). `null`/невалідна дата → поточний курс.
 *
 * Кешується per-request через React `cache()`; регістр курсів 1С — подобовий,
 * тому мс-точність дати на результат не впливає.
 */
export const getEurRateForDate = cache(
  async (date: Date | null): Promise<number> => {
    if (!date || Number.isNaN(date.getTime())) {
      return getCurrentRate();
    }
    try {
      // Найбільший запис з датою ≤ цільової (історичний курс на дату).
      const atOrBefore = await prisma.exchangeRate.findFirst({
        where: { currencyFrom: "EUR", currencyTo: "UAH", date: { lte: date } },
        orderBy: { date: "desc" },
      });
      if (atOrBefore) return atOrBefore.rate;
      // Дата раніше за перший відомий курс → беремо найперший доступний.
      const earliest = await prisma.exchangeRate.findFirst({
        where: { currencyFrom: "EUR", currencyTo: "UAH" },
        orderBy: { date: "asc" },
      });
      return earliest?.rate ?? FALLBACK_RATE;
    } catch {
      return FALLBACK_RATE;
    }
  },
);

export function formatUah(amountUah: number): string {
  return `${Math.round(amountUah).toLocaleString("uk-UA")} ₴`;
}

export function eurToUah(amountEur: number, rate: number): number {
  return amountEur * rate;
}
