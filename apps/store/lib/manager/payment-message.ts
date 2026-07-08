/**
 * Блок «Оплати / Каса» — Етап 3 message builder (Viber/share text).
 *
 * Pure (DB-agnostic) функція, що відтворює старий 1С-функціонал обробки
 * «Оплата» (`DataProcessor.Оплата → ПолучитьТекстСообщенияВайбер`, аудит §E) —
 * готовий текст-квитанція для відправки клієнту. UI лише підставляє текст у
 * редаговане поле `ShareSheet` (копіювати / Viber / Telegram / WhatsApp).
 *
 * Без I/O — увесь стан (ім'я клієнта, фактична оплата по валютах, решта, курси,
 * сума до сплати, наложка) приходить ззовні як plain object, тому білдер легко
 * будується з form-state клієнтом і тестується.
 *
 * Структура повідомлення (1С `ПолучитьТекстСообщенияВайбер`, 215-247):
 *
 * ```
 * Оплата
 * <ім'я клієнта>
 *
 * Оплачено: <X> €
 *
 * Фактична оплата:
 *   Готівка грн: <N> грн          ← лише ненульові канали
 *   Безнал грн: <N> грн (<рахунок>)
 *   EUR: <N> €
 *   USD: <N> $
 *
 * Решта:                          ← лише коли є здача
 *   <N> грн
 *   <N> €
 *   <N> $
 *
 * Накладений платіж: <N> грн      ← якщо наложка
 * Борг: <N> €   АБО   Переплата: <N> €   ← за залишком
 * ```
 */

/** Фактична оплата по 4 каналах (готівка 3 валюти + безнал грн). */
export interface PaymentReceiptPaid {
  /** Готівка, грн. */
  uah: number;
  /** Готівка, EUR. */
  eur: number;
  /** Готівка, USD. */
  usd: number;
  /** Безготівка, грн. */
  uahCashless: number;
}

/** Решта (здача) — 3 валюти готівкою (без безналу, як 1С §C). */
export interface PaymentReceiptChange {
  uah: number;
  eur: number;
  usd: number;
}

/** Курси-знімок (грн за €/$). */
export interface PaymentReceiptRates {
  /** EUR→UAH. */
  eur: number;
  /** USD→UAH. */
  usd: number;
}

/** Вхід білдера — plain object (НЕ Prisma-тип), будується з form-state. */
export interface PaymentReceiptInput {
  /** Назва клієнта (контрагента). */
  clientName: string;
  /**
   * Вид руху: `income` (Приход/ПКО — оплата від клієнта, дефолт) або `expense`
   * (Расход/РКО — видача коштів клієнту). Керує шапкою/підписами квитанції.
   */
  type?: "income" | "expense";
  /** Фактична оплата по каналах. */
  paid: PaymentReceiptPaid;
  /** Решта (здача) по валютах (готівкою). */
  change: PaymentReceiptChange;
  /** Назва банк. рахунку (для рядка безналу, за наявності). */
  bankAccountName?: string | null;
  /** Призначення платежу (для безготівки, за наявності). */
  paymentPurpose?: string | null;
  /** Курси-знімок. */
  rates: PaymentReceiptRates;
  /** Сума до сплати (EUR) — база для розрахунку боргу/переплати. */
  sumToPayEur: number;
  /** Наложка (післяплата) — показати окремий рядок. */
  cashOnDelivery?: boolean;
  /** Сума післяплати, грн. */
  codAmountUah?: number | null;
}

/** Форматує число з 2 знаками після коми. */
function n2(value: number): string {
  return value.toFixed(2);
}

/** Сума в EUR: «12.50 €». */
function eur(amount: number): string {
  return `${n2(amount)} €`;
}

/** Сума в грн: «1234.00 грн» (2 знаки, без штучного округлення). */
function uah(amount: number): string {
  return `${n2(amount)} грн`;
}

/** Сума в USD: «12.50 $». */
function usd(amount: number): string {
  return `${n2(amount)} $`;
}

/**
 * PURE. Зводить фактичну оплату у EUR (1С `ОплатаДокумента`, аудит §B-1):
 *   `eur + uah/rEur + uahCashless/rEur + usd*rUsd/rEur`.
 * Guard на нульові курси (як `reduceToEur` у cash-order.ts).
 */
function paidToEur(
  paid: PaymentReceiptPaid,
  rates: PaymentReceiptRates,
): number {
  const rEur = rates.eur;
  const rUsd = rates.usd;
  let total = paid.eur;
  if (rEur > 0) {
    total += paid.uah / rEur;
    total += paid.uahCashless / rEur;
    if (rUsd > 0) total += (paid.usd * rUsd) / rEur;
  }
  return Math.round(total * 100) / 100;
}

/** PURE. Зводить решту (здачу) у EUR (без безналу). */
function changeToEur(
  change: PaymentReceiptChange,
  rates: PaymentReceiptRates,
): number {
  const rEur = rates.eur;
  const rUsd = rates.usd;
  let total = change.eur;
  if (rEur > 0) {
    total += change.uah / rEur;
    if (rUsd > 0) total += (change.usd * rUsd) / rEur;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Будує текст-квитанцію оплати для Viber/share (порт
 * `ПолучитьТекстСообщенияВайбер`, аудит §E). Виводить лише ненульові канали
 * оплати/решти. Борг/переплата рахуються із залишку
 * `sumToPayEur − paidEur + changeEur` (1С `ОстатокДокумента`, §B-3).
 */
export function buildPaymentReceiptText(input: PaymentReceiptInput): string {
  const lines: string[] = [];
  const isExpense = input.type === "expense";

  // ── Шапка ── (Приход = «Оплата», Расход = «Видача коштів»)
  lines.push(isExpense ? "Видача коштів" : "Оплата");
  lines.push(input.clientName.trim());

  // ── Зведена сума (у EUR) ──
  const paidEur = paidToEur(input.paid, input.rates);
  lines.push("");
  lines.push(`${isExpense ? "Видано" : "Оплачено"}: ${eur(paidEur)}`);

  // ── Фактична сума по валютах (лише ненульові) ──
  const factLines: string[] = [];
  if (input.paid.uah > 0)
    factLines.push(`  Готівка грн: ${uah(input.paid.uah)}`);
  if (input.paid.uahCashless > 0) {
    const acct = input.bankAccountName?.trim();
    const purpose = input.paymentPurpose?.trim();
    let line = `  Безнал грн: ${uah(input.paid.uahCashless)}`;
    if (acct) line += ` (${acct})`;
    if (purpose) line += ` — ${purpose}`;
    factLines.push(line);
  }
  if (input.paid.eur > 0) factLines.push(`  EUR: ${eur(input.paid.eur)}`);
  if (input.paid.usd > 0) factLines.push(`  USD: ${usd(input.paid.usd)}`);
  if (factLines.length > 0) {
    lines.push("");
    lines.push(isExpense ? "Фактична видача:" : "Фактична оплата:");
    lines.push(...factLines);
  }

  // ── Решта (лише ненульові) ──
  const changeLines: string[] = [];
  if (input.change.uah > 0) changeLines.push(`  ${uah(input.change.uah)}`);
  if (input.change.eur > 0) changeLines.push(`  ${eur(input.change.eur)}`);
  if (input.change.usd > 0) changeLines.push(`  ${usd(input.change.usd)}`);
  if (changeLines.length > 0) {
    lines.push("");
    lines.push("Решта:");
    lines.push(...changeLines);
  }

  // ── Наложка ──
  if (input.cashOnDelivery && input.codAmountUah != null) {
    lines.push("");
    lines.push(`Накладений платіж: ${uah(input.codAmountUah)}`);
  }

  // ── Борг / переплата (залишок документа, §B-3) ── лише для Приходу; для
  // Расходу (видача коштів) поняття боргу з цієї суми не застосовне.
  if (!isExpense) {
    const changeEur = changeToEur(input.change, input.rates);
    const balanceEur =
      Math.round((input.sumToPayEur - paidEur + changeEur) * 100) / 100;
    if (balanceEur > 0) {
      lines.push(`Борг: ${eur(balanceEur)}`);
    } else if (balanceEur < 0) {
      lines.push(`Переплата: ${eur(-balanceEur)}`);
    }
  }

  return lines.join("\n");
}
