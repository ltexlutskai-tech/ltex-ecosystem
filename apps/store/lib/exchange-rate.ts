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

export function formatUah(amountUah: number): string {
  return `${Math.round(amountUah).toLocaleString("uk-UA")} ₴`;
}

export function eurToUah(amountEur: number, rate: number): number {
  return amountEur * rate;
}
