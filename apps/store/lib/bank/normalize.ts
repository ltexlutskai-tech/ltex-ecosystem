/**
 * Чисті нормалізатори банківського фіда (без Prisma/fetch — покрито тестами).
 *
 * Зводять специфічні формати банків до єдиної форми BankTransaction:
 * Monobank — мінорні одиниці (копійки) + числові ISO-коди валют.
 */

import type { MonoAccount, MonoStatementItem } from "./monobank";

export const MONO_PROVIDER = "monobank";

/** Числовий ISO-4217 → літерний код (невідомі лишаємо числом-рядком). */
const CURRENCY_BY_ISO_NUM: Record<number, string> = {
  980: "UAH",
  978: "EUR",
  840: "USD",
  985: "PLN",
  826: "GBP",
  124: "CAD",
};

export function currencyFromIsoNum(code: number): string {
  return CURRENCY_BY_ISO_NUM[code] ?? String(code);
}

/**
 * Мінорні одиниці (копійки/центи, ціле зі знаком) → сума в основній валюті.
 * Округлення до копійки прибирає float-шум (−95000 → −950).
 */
export function minorToAmount(minor: number): number {
  return Math.round(minor) / 100;
}

/** Нормалізована транзакція — форма рядка BankTransaction (без id/feedAccountId). */
export interface NormalizedBankTxn {
  provider: string;
  externalId: string;
  accountExternalId: string;
  occurredAt: Date;
  amount: number; // + прихід / − розхід, в основній валюті рахунку
  currencyCode: string;
  counterName: string | null;
  counterIban: string | null;
  counterEdrpou: string | null;
  description: string | null;
  comment: string | null;
  balanceAfter: number | null;
  hold: boolean;
  raw: unknown;
}

/** StatementItem Monobank (webhook або виписка) → нормалізована транзакція. */
export function normalizeMonoStatementItem(
  accountExternalId: string,
  item: MonoStatementItem,
): NormalizedBankTxn {
  return {
    provider: MONO_PROVIDER,
    externalId: item.id,
    accountExternalId,
    occurredAt: new Date(item.time * 1000),
    amount: minorToAmount(item.amount),
    currencyCode: currencyFromIsoNum(item.currencyCode),
    counterName: item.counterName?.trim() || null,
    counterIban: item.counterIban?.trim() || null,
    counterEdrpou: item.counterEdrpou?.trim() || null,
    description: item.description?.trim() || null,
    comment: item.comment?.trim() || null,
    balanceAfter:
      typeof item.balance === "number" ? minorToAmount(item.balance) : null,
    hold: item.hold === true,
    raw: item,
  };
}

/** Людська назва рахунку: тип + маска картки/хвіст IBAN. */
export function monoAccountTitle(acc: MonoAccount): string {
  const kind = acc.type === "fop" ? "ФОП" : (acc.type ?? "рахунок");
  const pan = acc.maskedPan?.[0];
  if (pan) return `${kind} ${pan.slice(-8)}`;
  if (acc.iban) return `${kind} …${acc.iban.slice(-6)}`;
  return kind;
}

/** Форма рахунку з client-info для upsert-у BankFeedAccount. */
export interface NormalizedFeedAccount {
  provider: string;
  externalId: string;
  iban: string | null;
  title: string;
  currencyCode: string;
  balance: number;
  creditLimit: number | null;
}

export function normalizeMonoAccount(acc: MonoAccount): NormalizedFeedAccount {
  return {
    provider: MONO_PROVIDER,
    externalId: acc.id,
    iban: acc.iban?.trim() || null,
    title: monoAccountTitle(acc),
    currencyCode: currencyFromIsoNum(acc.currencyCode),
    balance: minorToAmount(acc.balance),
    creditLimit:
      typeof acc.creditLimit === "number" && acc.creditLimit !== 0
        ? minorToAmount(acc.creditLimit)
        : null,
  };
}
