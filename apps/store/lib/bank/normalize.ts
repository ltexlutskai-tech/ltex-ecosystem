/**
 * Чисті нормалізатори банківського фіда (без Prisma/fetch — покрито тестами).
 *
 * Зводять специфічні формати банків до єдиної форми BankTransaction:
 * Monobank — мінорні одиниці (копійки) + числові ISO-коди валют.
 */

import type { MonoAccount, MonoStatementItem } from "./monobank";
import type { PrivatBalance, PrivatTransaction } from "./privatbank";

export const MONO_PROVIDER = "monobank";
export const PRIVAT_PROVIDER = "privatbank";

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

// ─── PrivatBank (Автоклієнт) ─────────────────────────────────────────────────

/** "1234.56" / "1 234,56" → число; невалідне → null. */
export function parsePrivatNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/\s+/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** "DD-MM-YYYY HH:MM:SS" (або "DD-MM-YYYY"+"HH:MM") → Date; невалідне → null. */
export function parsePrivatDateTime(
  dateTime: string | undefined,
  dateOnly?: string,
  time?: string,
): Date | null {
  const src =
    dateTime?.trim() ||
    (dateOnly ? `${dateOnly.trim()} ${time?.trim() ?? "00:00:00"}` : "");
  const m = src.match(
    /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!m) return null;
  const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = m;
  const d = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(mi),
    Number(ss),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Стабільний id транзакції Привату для дедупу: TECHNICAL_TRANSACTION_ID → ID →
 * складений fallback (REF/REFN/дата/сума) — той самий рядок з interim і final
 * дає той самий ключ.
 */
export function privatExternalId(t: PrivatTransaction): string | null {
  const direct = t.TECHNICAL_TRANSACTION_ID?.trim() || t.ID?.trim();
  if (direct) return direct;
  const ref = t.REF?.trim();
  if (!ref) return null;
  return [ref, t.REFN?.trim() ?? "", t.DAT_OD?.trim() ?? "", t.SUM ?? ""].join(
    "|",
  );
}

/**
 * Рядок виписки Автоклієнта → нормалізована транзакція. `null`, якщо рядок
 * непридатний (немає id/рахунку/суми/дати — таке в архів не пишемо).
 */
export function normalizePrivatTransaction(
  t: PrivatTransaction,
): NormalizedBankTxn | null {
  const externalId = privatExternalId(t);
  const accountExternalId = t.AUT_MY_ACC?.trim();
  const sum = parsePrivatNumber(t.SUM);
  const occurredAt = parsePrivatDateTime(
    t.DATE_TIME_DAT_OD_TIM_P,
    t.DAT_OD,
    t.TIM_P,
  );
  if (!externalId || !accountExternalId || sum === null || !occurredAt) {
    return null;
  }
  const isDebit = t.TRANTYPE?.trim().toUpperCase() === "D";
  return {
    provider: PRIVAT_PROVIDER,
    externalId,
    accountExternalId,
    occurredAt,
    amount: isDebit ? -sum : sum,
    currencyCode: t.CCY?.trim() || "UAH",
    counterName: t.AUT_CNTR_NAM?.trim() || null,
    counterIban: t.AUT_CNTR_ACC?.trim() || null,
    counterEdrpou: t.AUT_CNTR_CRF?.trim() || null,
    description: t.NUM_DOC?.trim() ? `Док. №${t.NUM_DOC.trim()}` : null,
    comment: t.OSND?.trim() || null, // призначення платежу
    balanceAfter: null, // Приват не дає залишок per-рядок
    // interim-рядки провізорні до закриття опердня (PR_PR="r" = фінальна).
    hold: t.PR_PR != null && t.PR_PR.trim() !== "" && t.PR_PR.trim() !== "r",
    raw: t,
  };
}

/** Залишок Автоклієнта → форма рахунку фіда. `null` без IBAN. */
export function normalizePrivatBalance(
  b: PrivatBalance,
): NormalizedFeedAccount | null {
  const iban = b.acc?.trim();
  if (!iban) return null;
  const currency = b.currency?.trim() || "UAH";
  return {
    provider: PRIVAT_PROVIDER,
    externalId: iban,
    iban,
    title: b.nameACC?.trim() || `Приват …${iban.slice(-6)}`,
    currencyCode: currency,
    balance: parsePrivatNumber(b.balanceOut) ?? 0,
    creditLimit: null,
  };
}
