import { prisma } from "@ltex/db";
import type { ChangeCurrency } from "@/lib/validations/manager-cash-order";
import {
  applyDebtMovementTx,
  recomputeDebtForClientsSafe,
} from "@/lib/manager/debt-register";

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

// ─────────────────────────────────────────────────────────────────────────────
// Блок «Оплати / Каса» — Етап 2. EUR-base модель (точна 1С-формула, аудит §B).
//
// Базова валюта зведення — **EUR** (як `СуммаДокумента` / `СуммаКОплате` у 1С).
// `rates.eur` = грн за €; `rates.usd` = грн за $.
// UAH→EUR: `uah / rateEur`. USD→EUR: `usd * rateUsd / rateEur` (USD→UAH→EUR).
// Усі компоненти зводимо до 2 знаків (`round2`), як `Окр(..., 2)` у 1С.
//
// Ці функції — нові й не зачіпають Stage-1/Stage-4 UAH-base helpers вище.
// ─────────────────────────────────────────────────────────────────────────────

/** Поріг «знижки на залишок» у EUR (1С `ПорогЗадолженостиEUR`, дефолт 5 €). */
export const PAYMENT_REMAINDER_DISCOUNT_THRESHOLD_EUR = 5;

/** Канали фактичної оплати (готівка 3 валюти + безнал грн). */
export interface PaidChannels {
  uah: number;
  eur: number;
  usd: number;
  uahCashless: number;
}

/** Решта (здача) — 3 валюти готівкою, без безналу (як 1С §C). */
export interface ChangeChannels {
  uah: number;
  eur: number;
  usd: number;
}

/**
 * PURE. Зводить фактичну оплату у EUR (1С `ОплатаДокумента`, аудит §B-1):
 *   `eur + round2(uah/rEur) + round2(uahCashless/rEur) + round2(usd*rUsd/rEur)`.
 *
 * Guard: `rEur <= 0` → внески UAH / безнал = 0; `rUsd <= 0` → внесок USD = 0.
 */
export function reduceToEur(paid: PaidChannels, rates: CashRates): number {
  const { eur, uah, usd, uahCashless } = paid;
  const rEur = rates.eur;
  const rUsd = rates.usd;
  let total = eur;
  if (rEur > 0) {
    total += round2(uah / rEur);
    total += round2(uahCashless / rEur);
    if (rUsd > 0) {
      total += round2((usd * rUsd) / rEur);
    }
  }
  return round2(total);
}

/**
 * PURE. Зводить фактичну решту (здачу) у EUR (1С `СдачаДокумента`, §B-2).
 * Без безналу: `eur + round2(uah/rEur) + round2(usd*rUsd/rEur)`.
 * Guard на нульові курси як у `reduceToEur`.
 */
export function reduceChangeToEur(
  change: ChangeChannels,
  rates: CashRates,
): number {
  const { eur, uah, usd } = change;
  const rEur = rates.eur;
  const rUsd = rates.usd;
  let total = eur;
  if (rEur > 0) {
    total += round2(uah / rEur);
    if (rUsd > 0) {
      total += round2((usd * rUsd) / rEur);
    }
  }
  return round2(total);
}

/**
 * PURE. Залишок документа у EUR (1С `ОстатокДокумента`, §B-3):
 *   `sumToPayEur − paidEur + changeEur`.
 * `> 0` = борг (недоплата), `< 0` = переплата (належить решта).
 */
export function computeBalanceEur({
  sumToPayEur,
  paidEur,
  changeEur,
}: {
  sumToPayEur: number;
  paidEur: number;
  changeEur: number;
}): number {
  return round2(sumToPayEur - paidEur + changeEur);
}

/** Рекомендовані суми «до сплати» у 3 валютах (0 коли переплачено). */
export interface PaymentRecommendations {
  payEur: number;
  payUah: number;
  payUsd: number;
}

/**
 * PURE. Рекомендації «скільки ще треба внести» (1С `ОплатаXxxРек`, §B-4).
 * `remain = sumToPayEur − paidEur`; коли `remain < 0` (переплата) → усі 0.
 */
export function computePaymentRecommendations({
  sumToPayEur,
  paidEur,
  rates,
}: {
  sumToPayEur: number;
  paidEur: number;
  rates: CashRates;
}): PaymentRecommendations {
  const remain = round2(sumToPayEur - paidEur);
  if (remain < 0) {
    return { payEur: 0, payUah: 0, payUsd: 0 };
  }
  const payUah = rates.eur > 0 ? round2(remain * rates.eur) : 0;
  const payUsd =
    rates.eur > 0 && rates.usd > 0
      ? round2((remain * rates.eur) / rates.usd)
      : 0;
  return { payEur: remain, payUah, payUsd };
}

/** Рекомендована решта у 3 валютах (0 коли немає переплати). */
export interface ChangeRecommendations {
  changeEur: number;
  changeUah: number;
  changeUsd: number;
}

/**
 * PURE. Рекомендована решта (1С `СдачаXxxРек`, §B-5) — лише коли `balanceEur < 0`
 * (переплата). Видає `|balanceEur|` зведене у 3 валюти.
 */
export function computeChangeRecommendations({
  balanceEur,
  rates,
}: {
  balanceEur: number;
  rates: CashRates;
}): ChangeRecommendations {
  if (balanceEur >= 0) {
    return { changeEur: 0, changeUah: 0, changeUsd: 0 };
  }
  const owed = -balanceEur;
  const changeUah = rates.eur > 0 ? round2(owed * rates.eur) : 0;
  const changeUsd =
    rates.eur > 0 && rates.usd > 0 ? round2((owed * rates.eur) / rates.usd) : 0;
  return { changeEur: round2(owed), changeUah, changeUsd };
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

// ─────────────────────────────────────────────────────────────────────────────
// Блок «Оплати / Каса» — Етап 2. Generalized create (EUR-base, ручна 3-валютна
// здача). Підтримує Приход/Расход, оплату без реалізації (`customerId`), банк.
// рахунок, статтю руху, курси-знімок. Здача (якщо введена руками >0) → другий
// ордер-розхід з `changeForId` (1С §C). Анти-дубля НЕМАЄ.
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePaymentArgs {
  /** Реалізація-підстава (опц.). */
  saleId?: string | null;
  /** Контрагент (резолвиться у Customer.id у викликачі). */
  customerId?: string | null;
  /** Вид руху: Приход (income) / Расход (expense). */
  type: "income" | "expense";
  /** Фактична оплата по каналах. */
  paid: PaidChannels;
  /** Ручна решта (здача) у 3 валютах. */
  change: ChangeChannels;
  bankAccountId?: string | null;
  cashFlowArticleId?: string | null;
  comment?: string | null;
  /** Курси-знімок (грн за €/$) — для `documentSumEur`. */
  rates: CashRates;
  /** Сума «До оплати» у EUR (для перерахунку наложки на Sale). */
  sumToPayEur: number;
  agentUserId?: string | null;
  /** Зворотне посилання на Маршрутний лист (МЛ) — ставиться на обидва ордери. */
  routeSheetId?: string | null;
}

/**
 * I/O. Транзакційно створює касовий ордер (Приход/Расход) у EUR-base моделі.
 *  • `documentSumEur = reduceToEur(paid, rates)`;
 *  • зберігає сирі суми по валютах + знімок курсів + довідникові FK + customerId;
 *  • якщо введена ручна здача (`change.uah/eur/usd` сумарно > 0) — другий ордер
 *    `type="expense"`, `changeForId` → прихідний, `documentSumEur =
 *    reduceChangeToEur(change, rates)` (1С §C);
 *  • після створення (коли є saleId і реалізація — наложкова) перераховує
 *    `Sale.codAmountUah` через `computeCashSummary` (як Stage-1/Stage-4).
 *
 * Повертає `{ income, change }` (`change` = null коли решти немає).
 */
export async function createPaymentOrders(args: CreatePaymentArgs) {
  const {
    saleId,
    customerId,
    type,
    paid,
    change,
    bankAccountId,
    cashFlowArticleId,
    comment,
    rates,
    sumToPayEur,
    agentUserId,
    routeSheetId,
  } = args;

  const documentSumEur = reduceToEur(paid, rates);
  const changeTotal = change.uah + change.eur + change.usd;

  // Клієнт руху боргу — резолвиться у транзакції, для перерахунку кешу після.
  let debtClientId: string | null = null;

  const result = await prisma.$transaction(async (tx) => {
    const income = await tx.mgrCashOrder.create({
      data: {
        saleId: saleId ?? null,
        customerId: customerId ?? null,
        type,
        amountUah: paid.uah,
        amountEur: paid.eur,
        amountUsd: paid.usd,
        amountUahCashless: paid.uahCashless,
        bankAccountId: bankAccountId ?? null,
        cashFlowArticleId: cashFlowArticleId ?? null,
        rateEur: rates.eur,
        rateUsd: rates.usd,
        documentSumEur,
        comment: comment ?? null,
        agentUserId: agentUserId ?? null,
        routeSheetId: routeSheetId ?? null,
      },
    });

    let changeOrder = null;
    if (changeTotal > 0) {
      changeOrder = await tx.mgrCashOrder.create({
        data: {
          saleId: saleId ?? null,
          customerId: customerId ?? null,
          type: "expense",
          changeForId: income.id,
          amountUah: change.uah,
          amountEur: change.eur,
          amountUsd: change.usd,
          amountUahCashless: 0,
          bankAccountId: bankAccountId ?? null,
          cashFlowArticleId: cashFlowArticleId ?? null,
          rateEur: rates.eur,
          rateUsd: rates.usd,
          documentSumEur: reduceChangeToEur(change, rates),
          comment: comment ?? null,
          agentUserId: agentUserId ?? null,
          routeSheetId: routeSheetId ?? null,
        },
      });
    }

    // Перерахунок наложки на Sale (тільки коли документ — наложковий).
    if (saleId) {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        select: { cashOnDelivery: true },
      });
      const orders = await tx.mgrCashOrder.findMany({
        where: { saleId, archived: false },
        select: {
          type: true,
          amountUah: true,
          amountEur: true,
          amountUsd: true,
          amountUahCashless: true,
        },
      });
      const dueUah = Math.round(sumToPayEur * rates.eur);
      const { balanceUah } = computeCashSummary({ dueUah, orders, rates });
      await tx.sale.update({
        where: { id: saleId },
        data: {
          codAmountUah: sale?.cashOnDelivery ? Math.max(0, balanceUah) : null,
        },
      });
    }

    // C1: рух боргу при оплаті (Приход) — погашення ЗМЕНШУЄ борг (−) — пишеться
    // у ТІЙ САМІЙ транзакції, що й ордер (атомарно; ідемпотентно за income.id).
    // Расход (standalone) НЕ обліковуємо — семантика боргу для нього неоднозначна.
    // Здача (change) окремим рухом не йде — вона вже врахована у `settledEur`.
    if (type === "income") {
      let effectiveCustomerId: string | null = customerId ?? null;
      if (!effectiveCustomerId && saleId) {
        const sale = await tx.sale.findUnique({
          where: { id: saleId },
          select: { customerId: true },
        });
        effectiveCustomerId = sale?.customerId ?? null;
      }

      // Сума, що фактично пішла в погашення (здача не зменшує борг).
      const settledEur =
        reduceToEur(paid, rates) - reduceChangeToEur(change, rates);

      if (effectiveCustomerId && settledEur !== 0) {
        debtClientId = await applyDebtMovementTx(tx, {
          customerId: effectiveCustomerId,
          amountEur: -settledEur, // оплата ЗМЕНШУЄ борг
          kind: "payment",
          sourceType: "cash_order",
          sourceId: income.id,
          occurredAt: income.createdAt ?? new Date(),
          note: "Оплата (касовий ордер)",
          createdByUserId: agentUserId ?? null,
        });
      }
    }

    return { income, change: changeOrder };
  });

  // C1: перерахунок кешу боргу — ПІСЛЯ коміту (кеш похідний, поза транзакцією).
  if (debtClientId) {
    await recomputeDebtForClientsSafe([debtClientId]);
  }

  return result;
}
