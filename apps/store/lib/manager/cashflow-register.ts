import { prisma } from "@ltex/db";

// ─────────────────────────────────────────────────────────────────────────────
// Регістр руху коштів (ДДС) — live-хук проведення касового ордера.
//
// Дзеркалить патерн `debt-register.ts` (`applyDebtMovementSafe`): окрема таблиця
// рухів + idempotent-ключ джерела. Для БОРГУ реєстратор = документ 1С (hex); для
// НАШИХ (нативних) документів реєстратора в 1С немає, тож використовуємо власний
// namespace `local:<cashOrderId>` — він не конфліктує з hex-ключами історичного
// імпорту, тому unique `(recorderCode1C, lineNo)` зберігається.
//
// Кожна ненульова грошова «нога» документа (готівка ₴/€/$, безнал ₴) → окремий
// рух, як у 1С `ДвиженияДенежныхСредств` (кожна валюта/рахунок — свій рух).
// Чиста корекція боргу (усі грошові суми = 0) рухів ДДС НЕ створює.
// ─────────────────────────────────────────────────────────────────────────────

/** Префікс реєстратора для нативних (не-1С) документів. */
export const LOCAL_RECORDER_PREFIX = "local:";

/**
 * Сентинел рахунку для готівкової каси (у L-TEX одна каса). Історичний імпорт
 * пише сюди hex(Касса); нативні готівкові ноги — цей сентинел. Звіт ДДС резолвить
 * його у підпис «Каса (готівка)».
 */
export const CASH_DESK_CODE = "CASH";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Грошові поля касового ордера (сирі суми по валютах + курси-знімок). */
export interface CashFlowOrderInput {
  type: string; // "income" | "expense"
  amountUah: number;
  amountEur: number;
  amountUsd: number;
  amountUahCashless: number;
  rateEur: number;
  rateUsd: number;
}

/** Один рух ДДС (без реєстратора/статті/клієнта — їх додає обгортка). */
export interface CashFlowLeg {
  lineNo: number;
  accountCode1C: string | null;
  currencyCode: "UAH" | "EUR" | "USD";
  direction: 0 | 1; // 0=прихід / 1=розхід
  /** Сума у валюті рахунку/каси (₴ для UAH-ніг, € для EUR, $ для USD). */
  amountUah: number;
  /** Сума в управлінській валюті (EUR). */
  amountUpr: number;
}

/**
 * PURE. Розкладає касовий ордер на рухи ДДС по грошових ногах.
 *
 * @param order  Грошові суми + курси-знімок документа.
 * @param cashlessAccountCode  Код рахунку для безготівкової ноги
 *   (`bankAccount.code1C ?? bankAccountId`), або null.
 * @returns Рухи ДДС (лише для ненульових ніг; порожній масив = немає руху грошей).
 *
 * `direction` = 0 для `type="income"`, 1 інакше. € для UAH-ноги рахуємо тим самим
 * курсом-знімком (`rateEur`), що й `documentSumEur` — НЕ живим курсом.
 */
export function buildCashFlowLegs(
  order: CashFlowOrderInput,
  cashlessAccountCode: string | null,
): CashFlowLeg[] {
  const direction: 0 | 1 = order.type === "income" ? 0 : 1;
  const rEur = order.rateEur;
  const rUsd = order.rateUsd;
  const legs: Omit<CashFlowLeg, "lineNo">[] = [];

  if (order.amountUah > 0) {
    legs.push({
      accountCode1C: CASH_DESK_CODE,
      currencyCode: "UAH",
      direction,
      amountUah: round2(order.amountUah),
      amountUpr: rEur > 0 ? round2(order.amountUah / rEur) : 0,
    });
  }
  if (order.amountUahCashless > 0) {
    legs.push({
      accountCode1C: cashlessAccountCode,
      currencyCode: "UAH",
      direction,
      amountUah: round2(order.amountUahCashless),
      amountUpr: rEur > 0 ? round2(order.amountUahCashless / rEur) : 0,
    });
  }
  if (order.amountEur > 0) {
    legs.push({
      accountCode1C: CASH_DESK_CODE,
      currencyCode: "EUR",
      direction,
      amountUah: round2(order.amountEur),
      amountUpr: round2(order.amountEur),
    });
  }
  if (order.amountUsd > 0) {
    legs.push({
      accountCode1C: CASH_DESK_CODE,
      currencyCode: "USD",
      direction,
      amountUah: round2(order.amountUsd),
      amountUpr:
        rEur > 0 && rUsd > 0 ? round2((order.amountUsd * rUsd) / rEur) : 0,
    });
  }

  return legs.map((leg, i) => ({ lineNo: i + 1, ...leg }));
}

/** Повний набір полів ордера, потрібний обгортці для запису рухів. */
export interface CashFlowOrderRow extends CashFlowOrderInput {
  id: string;
  bankAccountId: string | null;
  cashFlowArticleId: string | null;
  customerId: string | null;
  saleId: string | null;
  occurredAt: Date;
}

/**
 * Резолвить hex/код контрагента для рядка руху: платник ордера (`customerId`)
 * або клієнт його реалізації (`saleId`). Best-effort; null коли не знайдено.
 */
async function resolveClientCode(
  order: CashFlowOrderRow,
): Promise<string | null> {
  if (order.customerId) {
    const c = await prisma.customer.findUnique({
      where: { id: order.customerId },
      select: { code1C: true },
    });
    if (c?.code1C) return c.code1C;
  }
  if (order.saleId) {
    const sale = await prisma.sale.findUnique({
      where: { id: order.saleId },
      select: { customer: { select: { code1C: true } } },
    });
    if (sale?.customer?.code1C) return sale.customer.code1C;
  }
  return null;
}

/**
 * Fire-and-forget best-effort: пише рухи ДДС для проведеного касового ордера.
 * НІКОЛИ не кидає — лише логує warn. Викликається ПІСЛЯ коміту документа
 * (потрібен `order.id`), тому використовує singleton `prisma` (не tx).
 *
 * Idempotent: unique `(recorderCode1C, lineNo)` + `createMany skipDuplicates` —
 * повторний виклик для того самого ордера не дублює рухів (документ незмінний).
 */
export function applyCashFlowMovementsSafe(order: CashFlowOrderRow): void {
  void (async () => {
    const cashlessAccountCode = order.bankAccountId
      ? await resolveCashlessAccountCode(order.bankAccountId)
      : null;

    const legs = buildCashFlowLegs(order, cashlessAccountCode);
    if (legs.length === 0) return; // чиста корекція боргу — руху грошей немає

    const articleCode1C = await resolveArticleCode(order.cashFlowArticleId);
    const clientCode1C = await resolveClientCode(order);
    const recorderCode1C = `${LOCAL_RECORDER_PREFIX}${order.id}`;

    await prisma.cashFlowMovement.createMany({
      skipDuplicates: true,
      data: legs.map((leg) => ({
        occurredAt: order.occurredAt,
        recorderCode1C,
        lineNo: leg.lineNo,
        accountCode1C: leg.accountCode1C,
        articleCode1C,
        direction: leg.direction,
        clientCode1C,
        amountUah: leg.amountUah,
        amountUpr: leg.amountUpr,
        currencyCode: leg.currencyCode,
      })),
    });
  })().catch((e: unknown) => {
    console.warn("[L-TEX] Failed to apply cash-flow movements", {
      cashOrderId: order.id,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}

/** Резолвить `bankAccount.code1C ?? bankAccountId` для ноги безналу. */
async function resolveCashlessAccountCode(
  bankAccountId: string,
): Promise<string | null> {
  const acc = await prisma.mgrBankAccount.findUnique({
    where: { id: bankAccountId },
    select: { code1C: true },
  });
  return acc?.code1C ?? bankAccountId;
}

/** Резолвить `article.code1C ?? cashFlowArticleId` для рядка руху. */
async function resolveArticleCode(
  cashFlowArticleId: string | null,
): Promise<string | null> {
  if (!cashFlowArticleId) return null;
  const art = await prisma.mgrCashFlowArticle.findUnique({
    where: { id: cashFlowArticleId },
    select: { code1C: true },
  });
  return art?.code1C ?? cashFlowArticleId;
}

/**
 * Видаляє всі рухи ДДС нативного касового ордера (при видаленні документа).
 * Використовує `deleteMany` по `recorderCode1C` (leftmost prefix unique-індексу).
 */
export async function deleteCashFlowMovementsForOrder(
  txOrPrisma: {
    cashFlowMovement: {
      deleteMany: (args: {
        where: { recorderCode1C: string | { in: string[] } };
      }) => Promise<unknown>;
    };
  },
  cashOrderIds: string[],
): Promise<void> {
  const recorders = cashOrderIds.map((id) => `${LOCAL_RECORDER_PREFIX}${id}`);
  await txOrPrisma.cashFlowMovement.deleteMany({
    where: { recorderCode1C: { in: recorders } },
  });
}
