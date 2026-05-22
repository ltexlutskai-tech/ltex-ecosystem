import { prisma } from "@ltex/db";
import {
  computeCashSummary,
  type CashOrderForSummary,
  type CashRates,
} from "@/lib/manager/cash-order";

/**
 * Блок «Оплати / Каса» — Етап 1. Порт 1С `ПолучитьДанныеПоОплате`
 * (`docs/PAYMENTS_BLOCK_AUDIT.md` §E).
 *
 * Зведення оплат по реалізації: бере **лише непроведені-в-кошик** (не архівні)
 * касові ордери цієї реалізації, рахує:
 *  • `receivedUah` — чиста оплата (Σ income − Σ expense) у грн за курсами-знімком;
 *  • `changeUah`   — сума здачі (Σ expense) у грн;
 *  • `balanceUah`  — `due − received` (додатній = борг, відʼємний = переплата);
 *  • `status`      — «debt» / «prepay» / «settled»;
 *  • `byCurrency`  — фактична оплата (Приход) + здача (Расход) у розрізі валют;
 *  • `codAmountUah`— сума накладеного платежу (`СумаОплатиНаложкою`) = max(0, борг).
 *
 * Базова валюта зведення — EUR; усі суми у грн зводяться через `rates`
 * (EUR→UAH / USD→UAH), як у 1С (`СуммаУчета`). Експонуємо як pure-функцію
 * `aggregatePaymentSummary` (тест-френдлі) + I/O-обгортку `getPaymentSummary`.
 */

export type PaymentStatus = "debt" | "prepay" | "settled";

/** Касовий ордер для зведення (поля з DB). */
export interface PaymentOrderInput extends CashOrderForSummary {
  type: string; // income | expense
}

export interface PaymentSummary {
  /** Чиста оплата у грн (Приход − Расход). */
  receivedUah: number;
  /** Сума здачі у грн (Σ expense). */
  changeUah: number;
  /** Залишок у грн: `due − received` (>0 борг, <0 переплата). */
  balanceUah: number;
  /** Статус взаєморозрахунків. */
  status: PaymentStatus;
  /** Розбивка фактичної оплати / здачі по валютах (сирі суми). */
  byCurrency: {
    incomeUah: number;
    incomeEur: number;
    incomeUsd: number;
    incomeUahCashless: number;
    changeUah: number;
    changeEur: number;
    changeUsd: number;
  };
  /** Наложений платіж (грн) = залишковий борг (max(0, balance)). */
  codAmountUah: number;
}

/**
 * PURE. Зводить ордери (income/expense) по валютах + рахує нетто у грн
 * через `computeCashSummary`. `dueUah` = сума реалізації у грн за знімком.
 */
export function aggregatePaymentSummary({
  dueUah,
  orders,
  rates,
}: {
  dueUah: number;
  orders: PaymentOrderInput[];
  rates: CashRates;
}): PaymentSummary {
  const byCurrency = {
    incomeUah: 0,
    incomeEur: 0,
    incomeUsd: 0,
    incomeUahCashless: 0,
    changeUah: 0,
    changeEur: 0,
    changeUsd: 0,
  };

  for (const o of orders) {
    if (o.type === "expense") {
      // Здача (Расход). Безнал у здачу не йде (як у 1С §C).
      byCurrency.changeUah += o.amountUah;
      byCurrency.changeEur += o.amountEur;
      byCurrency.changeUsd += o.amountUsd;
    } else {
      byCurrency.incomeUah += o.amountUah;
      byCurrency.incomeEur += o.amountEur;
      byCurrency.incomeUsd += o.amountUsd;
      byCurrency.incomeUahCashless += o.amountUahCashless;
    }
  }

  const { receivedUah, changeUah, balanceUah } = computeCashSummary({
    dueUah,
    orders,
    rates,
  });

  const status: PaymentStatus =
    balanceUah > 0 ? "debt" : balanceUah < 0 ? "prepay" : "settled";

  return {
    receivedUah,
    changeUah,
    balanceUah,
    status,
    byCurrency,
    codAmountUah: Math.max(0, balanceUah),
  };
}

/**
 * I/O. Зведення оплат для реалізації `saleId`. Бере лише **не архівні**
 * касові ордери цієї реалізації; курси-знімок — з самої реалізації
 * (`exchangeRateEur`/`exchangeRateUsd`); `due` = `totalEur × rateEur` грн.
 *
 * Якщо реалізації немає — повертає `null`.
 */
export async function getPaymentSummary(
  saleId: string,
): Promise<PaymentSummary | null> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      totalEur: true,
      exchangeRateEur: true,
      exchangeRateUsd: true,
    },
  });
  if (!sale) return null;

  const orders = await prisma.mgrCashOrder.findMany({
    where: { saleId, archived: false },
    select: {
      type: true,
      amountUah: true,
      amountEur: true,
      amountUsd: true,
      amountUahCashless: true,
    },
  });

  const rates: CashRates = {
    eur: sale.exchangeRateEur,
    usd: sale.exchangeRateUsd,
  };
  const dueUah = Math.round(sale.totalEur * sale.exchangeRateEur);

  return aggregatePaymentSummary({ dueUah, orders, rates });
}
