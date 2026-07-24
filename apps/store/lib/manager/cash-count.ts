/**
 * Щоденне підбиття готівкової каси (Крок 4 банкінгу, ₴/€/$).
 *
 * Обліковий залишок каси = сума ЖИВИХ рухів ДДС по сентинелу готівкової каси
 * `CASH` (їх пишуть проведені касові ордери + переміщення готівки через
 * cashflow-register/treasury-posting). Історичні 1С-каси мають інші коди
 * (hex) і сюди свідомо НЕ входять — облік ведеться з моменту старту живої
 * системи; стартовий залишок вирівнюється разовим касовим ордером.
 */

import { prisma } from "@ltex/db";
import { CASH_DESK_CODE } from "./cashflow-register";

export interface CashBalances {
  UAH: number;
  EUR: number;
  USD: number;
}

export interface CashMovementSum {
  currencyCode: string | null;
  /** 0 = прихід, 1 = розхід. */
  direction: number;
  total: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** PURE. Згорнуті суми рухів по касі → залишок по валютах (прихід − розхід). */
export function computeCashBalances(rows: CashMovementSum[]): CashBalances {
  const out: CashBalances = { UAH: 0, EUR: 0, USD: 0 };
  for (const row of rows) {
    const code = (row.currencyCode ?? "UAH") as keyof CashBalances;
    if (!(code in out)) continue;
    const sign = row.direction === 0 ? 1 : -1;
    out[code] = round2(out[code] + sign * row.total);
  }
  return out;
}

/** Обліковий залишок готівкової каси по валютах — з рухів ДДС по `CASH`. */
export async function getCashBalances(): Promise<CashBalances> {
  const grouped = await prisma.cashFlowMovement.groupBy({
    by: ["currencyCode", "direction"],
    where: { accountCode1C: CASH_DESK_CODE },
    _sum: { amountUah: true },
  });
  return computeCashBalances(
    grouped.map((g) => ({
      currencyCode: g.currencyCode,
      direction: g.direction,
      total: Number(g._sum.amountUah ?? 0),
    })),
  );
}

export interface CashCountDiff {
  currency: keyof CashBalances;
  expected: number;
  actual: number;
  diff: number; // actual − expected: + надлишок / − недостача
}

/** PURE. Різниці «факт − облік» по валютах. */
export function computeDiffs(
  expected: CashBalances,
  actual: CashBalances,
): CashCountDiff[] {
  return (["UAH", "EUR", "USD"] as const).map((currency) => ({
    currency,
    expected: expected[currency],
    actual: actual[currency],
    diff: round2(actual[currency] - expected[currency]),
  }));
}
