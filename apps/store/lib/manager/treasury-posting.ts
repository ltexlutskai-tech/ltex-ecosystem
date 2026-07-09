import { prisma } from "@ltex/db";
import {
  CASH_DESK_CODE,
  LOCAL_RECORDER_PREFIX,
  type CashFlowLeg,
} from "./cashflow-register";
import {
  applyDebtMovementSafe,
  recomputeDebtForClients,
  resolveClientIdByCustomer,
} from "./debt-register";
import type {
  BankPaymentDraftInput,
  CashTransferDraftInput,
  TreasuryCurrency,
} from "@/lib/validations/manager-treasury";

// ─────────────────────────────────────────────────────────────────────────────
// Задача D — проведення казначейських документів (банк/каса) у регістр ДДС.
//
// Використовує ту саму механіку, що й `cashflow-register.ts` (Задача A):
//   • реєстратор нативних документів = `local:<docId>`;
//   • сентинел готівкової каси = `CASH`;
//   • idempotent-ключ `(recorderCode1C, lineNo)` → `createMany skipDuplicates`.
//
// Проведення (`status: draft→posted`):
//   • BankPaymentIncoming → 1 рух ДДС (прихід на рахунок) + зменшення боргу
//     клієнта через MgrDebtMovement (`kind="payment"`);
//   • BankPaymentOutgoing → 1 рух ДДС (розхід з рахунку); борг не зачіпає;
//   • CashTransfer → 2 рухи ДДС (розхід із джерела + прихід у призначення).
//
// Скасування (`status: posted→cancelled`) прибирає рухи документа (deleteMany по
// реєстратору), а для вхідної платіжки — ще й рух боргу + перерахунок боргу.
// Історичні (імпортовані) рухи не зачіпаються (у них інший реєстратор — hex).
// ─────────────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeCurrency(currency: string): TreasuryCurrency {
  return currency === "EUR" ? "EUR" : "UAH";
}

/**
 * PURE. Зводить суму документа у EUR за курсом-знімком (грн за €).
 *
 * • EUR → сама сума;
 * • UAH (та будь-що інше) → `amount / rateEur` (захист від ділення на 0).
 */
export function computeAmountEur(
  amount: number,
  currency: string,
  rateEur: number,
): number {
  if (normalizeCurrency(currency) === "EUR") return round2(amount);
  return rateEur > 0 ? round2(amount / rateEur) : 0;
}

/** Грошові поля документа, потрібні для розкладу на рух(и) ДДС. */
export interface TreasuryMoney {
  currency: string;
  /** Сума у валюті документа. */
  amount: number;
  /** Зведена сума EUR (знімок, порахований при створенні). */
  amountEur: number;
}

/**
 * PURE. Одна нога ДДС для банк-платіжки (вхідна = прихід, вихідна = розхід).
 * `amountUah` регістру = сума у валюті рахунку (тут = сума документа);
 * `amountUpr` = сума EUR. Порожній масив коли сума ≤ 0.
 */
export function buildBankPaymentLeg(
  money: TreasuryMoney,
  direction: 0 | 1,
  accountCode: string | null,
): CashFlowLeg[] {
  if (money.amount <= 0) return [];
  return [
    {
      lineNo: 1,
      accountCode1C: accountCode,
      currencyCode: normalizeCurrency(money.currency),
      direction,
      amountUah: round2(money.amount),
      amountUpr: round2(money.amountEur),
    },
  ];
}

/**
 * PURE. Дві ноги ДДС для переміщення готівки: розхід із джерела (lineNo=1,
 * direction=1) + прихід у призначення (lineNo=2, direction=0). `null` рахунок →
 * сентинел готівкової каси `CASH`. Порожній масив коли сума ≤ 0.
 */
export function buildCashTransferLegs(
  money: TreasuryMoney,
  fromCode: string | null,
  toCode: string | null,
): CashFlowLeg[] {
  if (money.amount <= 0) return [];
  const currencyCode = normalizeCurrency(money.currency);
  const amountUah = round2(money.amount);
  const amountUpr = round2(money.amountEur);
  return [
    {
      lineNo: 1,
      accountCode1C: fromCode ?? CASH_DESK_CODE,
      currencyCode,
      direction: 1,
      amountUah,
      amountUpr,
    },
    {
      lineNo: 2,
      accountCode1C: toCode ?? CASH_DESK_CODE,
      currencyCode,
      direction: 0,
      amountUah,
      amountUpr,
    },
  ];
}

export type PostErrorCode = "not_found" | "not_draft" | "not_posted";
export interface PostResult {
  ok: boolean;
  error?: PostErrorCode;
}

/** `bankAccount.code1C ?? bankAccountId`, або null. */
async function resolveAccountCode(
  bankAccountId: string | null,
): Promise<string | null> {
  if (!bankAccountId) return null;
  const acc = await prisma.mgrBankAccount.findUnique({
    where: { id: bankAccountId },
    select: { code1C: true },
  });
  return acc?.code1C ?? bankAccountId;
}

/** `article.code1C ?? cashFlowArticleId`, або null. */
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

/** `customer.code1C ?? customerId`, або null. */
async function resolveClientCode(
  customerId: string | null,
): Promise<string | null> {
  if (!customerId) return null;
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { code1C: true },
  });
  return c?.code1C ?? customerId;
}

// ─── BankPaymentIncoming ─────────────────────────────────────────────────────

/**
 * Проведення вхідної платіжки: draft→posted, 1 рух ДДС (прихід на рахунок) +
 * зменшення боргу клієнта (`MgrDebtMovement`, `kind="payment"`, `-amountEur`).
 */
export async function postBankPaymentIncoming(id: string): Promise<PostResult> {
  const doc = await prisma.bankPaymentIncoming.findUnique({ where: { id } });
  if (!doc) return { ok: false, error: "not_found" };
  if (doc.status !== "draft") return { ok: false, error: "not_draft" };

  const [accountCode, articleCode, clientCode] = await Promise.all([
    resolveAccountCode(doc.bankAccountId),
    resolveArticleCode(doc.cashFlowArticleId),
    resolveClientCode(doc.customerId),
  ]);

  const legs = buildBankPaymentLeg(
    { currency: doc.currency, amount: doc.amount, amountEur: doc.amountEur },
    0,
    accountCode,
  );
  const recorderCode1C = `${LOCAL_RECORDER_PREFIX}${id}`;

  await prisma.$transaction(async (tx) => {
    await tx.bankPaymentIncoming.update({
      where: { id },
      data: { status: "posted", postedAt: new Date() },
    });
    if (legs.length > 0) {
      await tx.cashFlowMovement.createMany({
        skipDuplicates: true,
        data: legs.map((leg) => ({
          occurredAt: doc.paidAt,
          recorderCode1C,
          lineNo: leg.lineNo,
          accountCode1C: leg.accountCode1C,
          articleCode1C: articleCode,
          direction: leg.direction,
          clientCode1C: clientCode,
          amountUah: leg.amountUah,
          amountUpr: leg.amountUpr,
          currencyCode: leg.currencyCode,
        })),
      });
    }
  });

  // Зменшення боргу клієнта — best-effort (fire-and-forget), як у касовому ордері.
  if (doc.customerId && doc.amountEur > 0) {
    applyDebtMovementSafe({
      customerId: doc.customerId,
      amountEur: -doc.amountEur,
      kind: "payment",
      sourceType: "bank_payment_incoming",
      sourceId: id,
      occurredAt: doc.paidAt,
    });
  }

  return { ok: true };
}

/** Скасування вхідної платіжки: posted→cancelled, прибирає ДДС + рух боргу. */
export async function cancelBankPaymentIncoming(
  id: string,
): Promise<PostResult> {
  const doc = await prisma.bankPaymentIncoming.findUnique({ where: { id } });
  if (!doc) return { ok: false, error: "not_found" };
  if (doc.status !== "posted") return { ok: false, error: "not_posted" };

  const recorderCode1C = `${LOCAL_RECORDER_PREFIX}${id}`;

  const debtMovements = await prisma.mgrDebtMovement.findMany({
    where: { sourceType: "bank_payment_incoming", sourceId: id },
    select: { clientId: true },
  });
  const affected = new Set(debtMovements.map((m) => m.clientId));

  await prisma.$transaction(async (tx) => {
    await tx.bankPaymentIncoming.update({
      where: { id },
      data: { status: "cancelled", postedAt: null },
    });
    await tx.cashFlowMovement.deleteMany({ where: { recorderCode1C } });
    await tx.mgrDebtMovement.deleteMany({
      where: { sourceType: "bank_payment_incoming", sourceId: id },
    });
  });

  if (affected.size === 0 && doc.customerId) {
    const clientId = await resolveClientIdByCustomer(prisma, doc.customerId);
    if (clientId) affected.add(clientId);
  }
  if (affected.size > 0) {
    await recomputeDebtForClients(prisma, [...affected]);
  }

  return { ok: true };
}

// ─── BankPaymentOutgoing ─────────────────────────────────────────────────────

/** Проведення вихідної платіжки: draft→posted, 1 рух ДДС (розхід). Борг не чіпає. */
export async function postBankPaymentOutgoing(id: string): Promise<PostResult> {
  const doc = await prisma.bankPaymentOutgoing.findUnique({ where: { id } });
  if (!doc) return { ok: false, error: "not_found" };
  if (doc.status !== "draft") return { ok: false, error: "not_draft" };

  const [accountCode, articleCode, clientCode] = await Promise.all([
    resolveAccountCode(doc.bankAccountId),
    resolveArticleCode(doc.cashFlowArticleId),
    resolveClientCode(doc.customerId),
  ]);

  const legs = buildBankPaymentLeg(
    { currency: doc.currency, amount: doc.amount, amountEur: doc.amountEur },
    1,
    accountCode,
  );
  const recorderCode1C = `${LOCAL_RECORDER_PREFIX}${id}`;

  await prisma.$transaction(async (tx) => {
    await tx.bankPaymentOutgoing.update({
      where: { id },
      data: { status: "posted", postedAt: new Date() },
    });
    if (legs.length > 0) {
      await tx.cashFlowMovement.createMany({
        skipDuplicates: true,
        data: legs.map((leg) => ({
          occurredAt: doc.paidAt,
          recorderCode1C,
          lineNo: leg.lineNo,
          accountCode1C: leg.accountCode1C,
          articleCode1C: articleCode,
          direction: leg.direction,
          clientCode1C: clientCode,
          amountUah: leg.amountUah,
          amountUpr: leg.amountUpr,
          currencyCode: leg.currencyCode,
        })),
      });
    }
  });

  return { ok: true };
}

/** Скасування вихідної платіжки: posted→cancelled, прибирає ДДС. */
export async function cancelBankPaymentOutgoing(
  id: string,
): Promise<PostResult> {
  const doc = await prisma.bankPaymentOutgoing.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!doc) return { ok: false, error: "not_found" };
  if (doc.status !== "posted") return { ok: false, error: "not_posted" };

  const recorderCode1C = `${LOCAL_RECORDER_PREFIX}${id}`;
  await prisma.$transaction(async (tx) => {
    await tx.bankPaymentOutgoing.update({
      where: { id },
      data: { status: "cancelled", postedAt: null },
    });
    await tx.cashFlowMovement.deleteMany({ where: { recorderCode1C } });
  });

  return { ok: true };
}

// ─── CashTransfer ────────────────────────────────────────────────────────────

/** Проведення переміщення: draft→posted, 2 рухи ДДС (розхід + прихід). */
export async function postCashTransfer(id: string): Promise<PostResult> {
  const doc = await prisma.cashTransfer.findUnique({ where: { id } });
  if (!doc) return { ok: false, error: "not_found" };
  if (doc.status !== "draft") return { ok: false, error: "not_draft" };

  const [fromCode, toCode, articleCode] = await Promise.all([
    resolveAccountCode(doc.fromAccountId),
    resolveAccountCode(doc.toAccountId),
    resolveArticleCode(doc.cashFlowArticleId),
  ]);

  const legs = buildCashTransferLegs(
    { currency: doc.currency, amount: doc.amount, amountEur: doc.amountEur },
    fromCode,
    toCode,
  );
  const recorderCode1C = `${LOCAL_RECORDER_PREFIX}${id}`;

  await prisma.$transaction(async (tx) => {
    await tx.cashTransfer.update({
      where: { id },
      data: { status: "posted", postedAt: new Date() },
    });
    if (legs.length > 0) {
      await tx.cashFlowMovement.createMany({
        skipDuplicates: true,
        data: legs.map((leg) => ({
          occurredAt: doc.transferredAt,
          recorderCode1C,
          lineNo: leg.lineNo,
          accountCode1C: leg.accountCode1C,
          articleCode1C: articleCode,
          direction: leg.direction,
          clientCode1C: null,
          amountUah: leg.amountUah,
          amountUpr: leg.amountUpr,
          currencyCode: leg.currencyCode,
        })),
      });
    }
  });

  return { ok: true };
}

/** Скасування переміщення: posted→cancelled, прибирає обидва рухи ДДС. */
export async function cancelCashTransfer(id: string): Promise<PostResult> {
  const doc = await prisma.cashTransfer.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!doc) return { ok: false, error: "not_found" };
  if (doc.status !== "posted") return { ok: false, error: "not_posted" };

  const recorderCode1C = `${LOCAL_RECORDER_PREFIX}${id}`;
  await prisma.$transaction(async (tx) => {
    await tx.cashTransfer.update({
      where: { id },
      data: { status: "cancelled", postedAt: null },
    });
    await tx.cashFlowMovement.deleteMany({ where: { recorderCode1C } });
  });

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Автозбереження чернетки (draft) казначейських документів — рівень 2
// (План AUTOSAVE_REALTIME_PLAN §2). Пишуть/оновлюють рядок зі `status="draft"`.
//
// ⚠️ Грошова безпека: жодних рухів ДДС/боргу — вони з'являються ЛИШЕ при
// проведенні (`postBankPayment*`/`postCashTransfer` через `[id]/post`). Тобто
// autosave тут безпечний за визначенням (створення документа не проводить рухів).
// ─────────────────────────────────────────────────────────────────────────────

/** Парсить опційну ISO-дату у Date (fallback — `now`). */
function draftDate(raw: string | null | undefined): Date {
  if (!raw) return new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Спільний набір даних чернетки банк-платіжки (для create/update). */
function bankPaymentDraftData(input: BankPaymentDraftInput) {
  const amount = input.amount ?? 0;
  const currency = input.currency ?? "UAH";
  const rateEur = input.rateEur ?? 0;
  return {
    customerId: input.customerId ?? null,
    bankAccountId: input.bankAccountId ?? null,
    cashFlowArticleId: input.cashFlowArticleId ?? null,
    amount,
    currency,
    amountEur: computeAmountEur(amount, currency, rateEur),
    rateEur,
    iban: input.iban ?? null,
    purpose: input.purpose ?? null,
    comment: input.comment ?? null,
    paidAt: draftDate(input.paidAt),
    status: "draft",
  };
}

/** Створює чернетку вхідної платіжки (`status="draft"`, БЕЗ рухів). */
export async function createBankPaymentIncomingDraft(
  input: BankPaymentDraftInput,
  userId: string,
) {
  return prisma.bankPaymentIncoming.create({
    data: { ...bankPaymentDraftData(input), createdByUserId: userId },
    select: { id: true, status: true },
  });
}

/** Оновлює чернетку вхідної платіжки (БЕЗ рухів). */
export async function updateBankPaymentIncomingDraft(
  id: string,
  input: BankPaymentDraftInput,
) {
  return prisma.bankPaymentIncoming.update({
    where: { id },
    data: bankPaymentDraftData(input),
    select: { id: true, status: true },
  });
}

/** Створює чернетку вихідної платіжки (`status="draft"`, БЕЗ рухів). */
export async function createBankPaymentOutgoingDraft(
  input: BankPaymentDraftInput,
  userId: string,
) {
  return prisma.bankPaymentOutgoing.create({
    data: { ...bankPaymentDraftData(input), createdByUserId: userId },
    select: { id: true, status: true },
  });
}

/** Оновлює чернетку вихідної платіжки (БЕЗ рухів). */
export async function updateBankPaymentOutgoingDraft(
  id: string,
  input: BankPaymentDraftInput,
) {
  return prisma.bankPaymentOutgoing.update({
    where: { id },
    data: bankPaymentDraftData(input),
    select: { id: true, status: true },
  });
}

/** Спільний набір даних чернетки переміщення готівки. */
function cashTransferDraftData(input: CashTransferDraftInput) {
  const amount = input.amount ?? 0;
  const currency = input.currency ?? "UAH";
  const rateEur = input.rateEur ?? 0;
  return {
    fromAccountId: input.fromAccountId ?? null,
    toAccountId: input.toAccountId ?? null,
    cashFlowArticleId: input.cashFlowArticleId ?? null,
    amount,
    currency,
    amountEur: computeAmountEur(amount, currency, rateEur),
    rateEur,
    comment: input.comment ?? null,
    transferredAt: draftDate(input.transferredAt),
    status: "draft",
  };
}

/** Створює чернетку переміщення готівки (`status="draft"`, БЕЗ рухів). */
export async function createCashTransferDraft(
  input: CashTransferDraftInput,
  userId: string,
) {
  return prisma.cashTransfer.create({
    data: { ...cashTransferDraftData(input), createdByUserId: userId },
    select: { id: true, status: true },
  });
}

/** Оновлює чернетку переміщення готівки (БЕЗ рухів). */
export async function updateCashTransferDraft(
  id: string,
  input: CashTransferDraftInput,
) {
  return prisma.cashTransfer.update({
    where: { id },
    data: cashTransferDraftData(input),
    select: { id: true, status: true },
  });
}
