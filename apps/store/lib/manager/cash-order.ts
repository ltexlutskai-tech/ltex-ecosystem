import { prisma } from "@ltex/db";
import type { ChangeCurrency } from "@/lib/validations/manager-cash-order";

/**
 * Блок «Реалізація» — Етап 4. Касовий ордер (каса) + розрахунок здачі.
 *
 * Конвенції грошей:
 *  - суми зберігаються «сирими» по кожній валюті (`amountUah`/`amountEur`/
 *    `amountUsd`/`amountUahCashless`);
 *  - усі порівняння йдуть через грн за курсами-знімком реалізації
 *    (`rates.eur` = EUR→UAH, `rates.usd` = USD→UAH);
 *  - грн округлюємо до цілих, інші валюти — до 2 знаків.
 *
 * Тут лише чисті функції (без I/O) + одна транзакційна `createCashOrderWithChange`.
 */

export interface CashRates {
  /** EUR→UAH. */
  eur: number;
  /** USD→UAH. */
  usd: number;
}

export interface CashPaid {
  uah: number;
  eur: number;
  usd: number;
  uahCashless: number;
}

/** Мінімальна форма касового ордера для агрегації (поля з DB). */
export interface CashOrderForSummary {
  type: string; // income | expense
  amountUah: number;
  amountEur: number;
  amountUsd: number;
  amountUahCashless: number;
}

/** Округлення грн до цілих. */
function roundUah(n: number): number {
  return Math.round(n);
}

/** Округлення суми у валюті до 2 знаків. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * PURE. Конвертує суму у грн у цільову валюту за курсами-знімком.
 * UAH — без змін; EUR/USD — діленням на курс (guard на нульовий курс → 0).
 * Результат округлено до 2 знаків.
 */
export function convertUahTo(
  amountUah: number,
  currency: ChangeCurrency,
  rates: CashRates,
): number {
  if (currency === "UAH") return round2(amountUah);
  const rate = currency === "EUR" ? rates.eur : rates.usd;
  if (!rate || rate <= 0) return 0;
  return round2(amountUah / rate);
}

/**
 * PURE. Зводить «сирі» суми ордера у грн за курсами-знімком.
 * Готівка грн + безнал грн беруться як є; EUR/USD множаться на курс.
 */
function orderTotalUah(order: CashOrderForSummary, rates: CashRates): number {
  return (
    order.amountUah +
    order.amountUahCashless +
    order.amountEur * rates.eur +
    order.amountUsd * rates.usd
  );
}

/**
 * PURE. Розрахунок здачі для нової оплати.
 *
 * `paidUah = uah + uahCashless + eur*rates.eur + usd*rates.usd`,
 * `changeUah = max(0, round(paidUah − dueUah))`.
 */
export function computeChange({
  dueUah,
  paid,
  rates,
}: {
  dueUah: number;
  paid: CashPaid;
  rates: CashRates;
}): { paidUah: number; changeUah: number } {
  const paidUah =
    paid.uah + paid.uahCashless + paid.eur * rates.eur + paid.usd * rates.usd;
  const changeUah = Math.max(0, roundUah(paidUah - dueUah));
  return { paidUah: round2(paidUah), changeUah };
}

/**
 * PURE. Зведення по реалізації: скільки фактично отримано (income − expense,
 * усі валюти → грн) та залишок (борг якщо > 0 / переплата якщо < 0).
 *
 * `receivedUah` = Σ income − Σ expense (expense — це здача, тож вона зменшує
 * фактично отримане); `balanceUah = dueUah − receivedUah`.
 */
export function computeCashSummary({
  dueUah,
  orders,
  rates,
}: {
  dueUah: number;
  orders: CashOrderForSummary[];
  /** Курси-знімок реалізації (EUR→UAH / USD→UAH) для зведення сум у грн. */
  rates: CashRates;
}): { receivedUah: number; changeUah: number; balanceUah: number } {
  // Кожен ордер несе «сирі» суми по валютах; зводимо у грн за курсами-знімком
  // реалізації (EUR/USD-готівка теж враховується, бо форма оплати приймає
  // усі три валюти + здачу в 3 валютах). Expense (здача) зменшує отримане.
  let incomeUah = 0;
  let expenseUah = 0;
  let changeUah = 0;
  for (const o of orders) {
    const totalUah = orderTotalUah(o, rates);
    if (o.type === "expense") {
      expenseUah += totalUah;
      changeUah += totalUah;
    } else {
      incomeUah += totalUah;
    }
  }
  const receivedUah = roundUah(incomeUah - expenseUah);
  const balanceUah = roundUah(dueUah - receivedUah);
  return { receivedUah, changeUah: roundUah(changeUah), balanceUah };
}

export interface CreateCashOrderArgs {
  saleId: string;
  type: "income";
  amounts: CashPaid;
  bankAccount?: string | null;
  cashFlowArticle?: string | null;
  comment?: string | null;
  changeCurrency: ChangeCurrency;
  dueUah: number;
  rates: CashRates;
  agentUserId?: string | null;
}

/**
 * I/O. Транзакційно створює прихідний касовий ордер, рахує здачу і — коли
 * здача > 0 — другий ордер-розхід (`type=expense`, `changeForId` → прихідний,
 * сума здачі розміщена у `amount*` за `convertUahTo`). Після цього перераховує
 * `Sale.codAmountUah` (для наложки): max(0, round(due − received)).
 *
 * Повертає `{ income, change }` (`change` = null коли здачі немає).
 */
export async function createCashOrderWithChange(args: CreateCashOrderArgs) {
  const {
    saleId,
    amounts,
    bankAccount,
    cashFlowArticle,
    comment,
    changeCurrency,
    dueUah,
    rates,
    agentUserId,
  } = args;

  const { changeUah } = computeChange({ dueUah, paid: amounts, rates });

  return prisma.$transaction(async (tx) => {
    const income = await tx.mgrCashOrder.create({
      data: {
        saleId,
        type: "income",
        amountUah: amounts.uah,
        amountEur: amounts.eur,
        amountUsd: amounts.usd,
        amountUahCashless: amounts.uahCashless,
        bankAccount: bankAccount ?? null,
        cashFlowArticle: cashFlowArticle ?? null,
        comment: comment ?? null,
        agentUserId: agentUserId ?? null,
      },
    });

    let change = null;
    if (changeUah > 0) {
      const changeAmount = convertUahTo(changeUah, changeCurrency, rates);
      change = await tx.mgrCashOrder.create({
        data: {
          saleId,
          type: "expense",
          changeForId: income.id,
          changeCurrency,
          amountUah: changeCurrency === "UAH" ? changeAmount : 0,
          amountEur: changeCurrency === "EUR" ? changeAmount : 0,
          amountUsd: changeCurrency === "USD" ? changeAmount : 0,
          bankAccount: bankAccount ?? null,
          cashFlowArticle: cashFlowArticle ?? null,
          comment: comment ?? null,
          agentUserId: agentUserId ?? null,
        },
      });
    }

    // Перерахунок наложки на Sale (тільки коли документ — наложковий).
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      select: { cashOnDelivery: true },
    });
    const orders = await tx.mgrCashOrder.findMany({
      where: { saleId },
      select: {
        type: true,
        amountUah: true,
        amountEur: true,
        amountUsd: true,
        amountUahCashless: true,
      },
    });
    const { balanceUah } = computeCashSummary({ dueUah, orders, rates });
    await tx.sale.update({
      where: { id: saleId },
      data: {
        codAmountUah: sale?.cashOnDelivery ? Math.max(0, balanceUah) : null,
      },
    });

    return { income, change };
  });
}
