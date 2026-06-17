/**
 * Чисті хелпери для переглядача регістру «Курси валют»
 * (`/manager/registry/rates`).
 *
 * Винесено окремо для тестування: побудова Prisma `where` із searchParams
 * та маппінг запису `ExchangeRate` → рядок таблиці RegisterViewer.
 *
 * NB: у нашій БД `ExchangeRate.rate` зберігається ВЖЕ нормалізованим «за 1
 * одиницю валюти» (імпортер ділить 1С-курс на кратність). Тому кратність у
 * переглядачі завжди = 1 (вихідну 1С-кратність ми не зберігаємо).
 */

import { Prisma } from "@ltex/db";

/** Валюти, які тримаємо у ряді (currencyFrom). */
export const RATE_CURRENCIES = ["EUR", "USD"] as const;
export type RateCurrency = (typeof RATE_CURRENCIES)[number];

export function isRateCurrency(value: string): value is RateCurrency {
  return (RATE_CURRENCIES as readonly string[]).includes(value);
}

/** Сирий зріз фільтрів зі searchParams. */
export interface RateFilterInput {
  from?: string;
  to?: string;
  currency?: string;
}

/** Безпечний парс дати `YYYY-MM-DD` → Date | undefined. */
function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Будує Prisma WHERE для `ExchangeRate` із вхідних фільтрів.
 * Завжди обмежує `currencyTo = "UAH"` (ми тримаємо лише курси до гривні).
 * Період — за `date`; валюта — за `currencyFrom` (EUR/USD).
 */
export function buildRatesWhere(
  input: RateFilterInput,
): Prisma.ExchangeRateWhereInput {
  const where: Prisma.ExchangeRateWhereInput = { currencyTo: "UAH" };

  const from = parseDate(input.from);
  const to = parseDate(input.to);
  if (from || to) {
    const date: Prisma.DateTimeFilter = {};
    if (from) date.gte = from;
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      date.lte = end;
    }
    where.date = date;
  }

  if (input.currency && isRateCurrency(input.currency)) {
    where.currencyFrom = input.currency;
  }

  return where;
}

/** Сирий запис курсу з Prisma. */
export interface RateRaw {
  id: string;
  currencyFrom: string;
  currencyTo: string;
  rate: number;
  date: Date;
}

/** Рядок таблиці для RegisterViewer (серіалізований). */
export interface RateRegisterRow {
  id: string;
  date: string;
  currency: string;
  rate: number;
  multiplier: number;
}

/** Маппінг запису курсу → рядок таблиці. */
export function mapRateToRow(r: RateRaw): RateRegisterRow {
  return {
    id: r.id,
    date: r.date.toISOString(),
    currency: r.currencyFrom,
    rate: typeof r.rate === "number" ? r.rate : Number(r.rate),
    // Курс у БД нормалізований «за 1 одиницю» → кратність завжди 1.
    multiplier: 1,
  };
}
