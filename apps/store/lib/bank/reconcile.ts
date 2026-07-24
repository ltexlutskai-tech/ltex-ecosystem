/**
 * Авто-рознесення банківських транзакцій (Крок 3 воронки, §11 аналізу).
 *
 * Для кожної необробленої транзакції фіда:
 *  • ПРИХІД (₴): збираємо сигнали (номер документа у призначенні → очікування
 *    оплати → памʼять платників) через чистий lib/bank/match.ts і діємо:
 *      - auto  → створюємо + ПРОВОДИМО BankPaymentIncoming (борг ↓, ДДС +)
 *                через treasury-posting; вчимо памʼять платників; закриваємо
 *                очікування; сповіщаємо менеджера клієнта;
 *      - draft → чернетка BankPaymentIncoming + сповіщення «підтвердіть»;
 *      - none  → дошка «Нерознесені гроші» (/manager/bank).
 *  • РОЗХІД: якщо у налаштуваннях задано статтю авто-розходу
 *    (MgrSetting `bank:auto_expense_article_id`) — створюємо + проводимо
 *    BankPaymentOutgoing з цією статтею; інакше — на дошку.
 *
 * Авто-проведення можливе ЛИШЕ коли рахунок фіда привʼязано до довідника
 * (BankFeedAccount.mgrBankAccountId) — інакше максимум чернетка.
 * Валюта: авто працює для UAH (безготівка L-TEX — лише IBAN ₴); EUR/USD — на
 * дошку вручну.
 */

import { prisma } from "@ltex/db";
import { getCurrentRate } from "@/lib/exchange-rate";
import {
  computeAmountEur,
  postBankPaymentIncoming,
  postBankPaymentOutgoing,
} from "@/lib/manager/treasury-posting";
import {
  collectSignals,
  decide,
  extractDocRefs,
  type DocRefInput,
  type MatchDecision,
  type OpenExpectationInput,
  type PayerRequisiteInput,
} from "./match";

/** MgrSetting: стаття ДДС для авто-проведення РОЗХОДІВ з виписки (опційно). */
export const AUTO_EXPENSE_ARTICLE_KEY = "bank:auto_expense_article_id";
/** MgrSetting: стаття ДДС для авто-проведення ПРИХОДІВ з виписки (опційно). */
export const AUTO_INCOME_ARTICLE_KEY = "bank:auto_income_article_id";

const DEFAULT_BATCH = 50;

export interface ReconcileResult {
  checked: number;
  autoPosted: number;
  drafts: number;
  unmatched: number;
  expensesPosted: number;
  errors: number;
}

interface PendingTxn {
  id: string;
  provider: string;
  amount: number;
  currencyCode: string;
  occurredAt: Date;
  counterName: string | null;
  counterIban: string | null;
  counterEdrpou: string | null;
  comment: string | null;
  description: string | null;
  feedAccount: { mgrBankAccountId: string | null };
}

async function readSetting(key: string): Promise<string | null> {
  const row = await prisma.mgrSetting.findUnique({ where: { key } });
  return row?.value?.trim() || null;
}

/** Резолв номерів документів з призначення → клієнт/реалізація. */
async function resolveDocRefs(refs: string[]): Promise<DocRefInput[]> {
  const out: DocRefInput[] = [];
  for (const ref of refs) {
    const sale = await prisma.sale.findFirst({
      where: { number1C: ref, markedForDeletion: false },
      select: { id: true, customerId: true },
    });
    if (sale) {
      out.push({ ref, customerId: sale.customerId, saleId: sale.id });
      continue;
    }
    const order = await prisma.order.findFirst({
      where: { number1C: ref },
      select: { customerId: true },
    });
    if (order) out.push({ ref, customerId: order.customerId, saleId: null });
  }
  return out;
}

/** Менеджер клієнта (для сповіщення): агент MgrClient за code1C клієнта. */
async function resolveManagerUserId(
  customerId: string,
  saleId: string | null,
): Promise<string | null> {
  if (saleId) {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { assignedAgentUserId: true },
    });
    if (sale?.assignedAgentUserId) return sale.assignedAgentUserId;
  }
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { code1C: true, phone: true },
  });
  if (!customer) return null;
  const mgr = customer.code1C
    ? await prisma.mgrClient.findFirst({
        where: { code1C: customer.code1C },
        select: { agentUserId: true },
      })
    : null;
  return mgr?.agentUserId ?? null;
}

async function notifyManager(userId: string | null, body: string) {
  if (!userId) return;
  await prisma.mgrReminder
    .create({
      data: {
        ownerUserId: userId,
        body,
        remindAt: new Date(),
        source: "manual",
      },
    })
    .catch(() => undefined);
}

/** Вчимо памʼять платників (ідемпотентно — без дублів по iban/edrpou). */
export async function learnPayerRequisite(args: {
  customerId: string;
  counterIban: string | null;
  counterEdrpou: string | null;
  counterName: string | null;
  createdByUserId?: string | null;
  note?: string;
}): Promise<void> {
  const iban = args.counterIban?.trim() || null;
  const edrpou = args.counterEdrpou?.trim() || null;
  if (!iban && !edrpou) return;

  const existing = await prisma.clientPayerRequisite.findFirst({
    where: {
      customerId: args.customerId,
      OR: [
        ...(iban ? [{ counterIban: iban }] : []),
        ...(edrpou ? [{ counterEdrpou: edrpou }] : []),
      ],
    },
    select: { id: true },
  });
  if (existing) return;

  await prisma.clientPayerRequisite.create({
    data: {
      customerId: args.customerId,
      counterIban: iban,
      counterEdrpou: edrpou,
      counterName: args.counterName?.trim() || null,
      note: args.note ?? null,
      createdByUserId: args.createdByUserId ?? null,
    },
  });
}

/**
 * Створює вхідну платіжку з транзакції фіда (і, за potreби, проводить).
 * Повертає id документа. Використовується і авто-воронкою, і ручним
 * рознесенням з дошки.
 */
export async function createIncomingFromTransaction(args: {
  txn: PendingTxn;
  customerId: string;
  post: boolean;
  note: string;
  createdByUserId?: string | null;
}): Promise<{ id: string; posted: boolean }> {
  const { txn } = args;
  const rateEur = await getCurrentRate();
  const articleId = await readSetting(AUTO_INCOME_ARTICLE_KEY);

  const doc = await prisma.bankPaymentIncoming.create({
    data: {
      customerId: args.customerId,
      bankAccountId: txn.feedAccount.mgrBankAccountId,
      cashFlowArticleId: articleId,
      amount: txn.amount,
      currency: txn.currencyCode === "EUR" ? "EUR" : "UAH",
      amountEur: computeAmountEur(
        txn.amount,
        txn.currencyCode === "EUR" ? "EUR" : "UAH",
        rateEur,
      ),
      rateEur,
      iban: txn.counterIban,
      purpose: txn.comment ?? txn.description,
      comment: `Банківська виписка (${txn.provider}). ${args.note}`,
      paidAt: txn.occurredAt,
      status: "draft",
      createdByUserId: args.createdByUserId ?? null,
    },
    select: { id: true },
  });

  let posted = false;
  if (args.post && txn.feedAccount.mgrBankAccountId) {
    const res = await postBankPaymentIncoming(doc.id);
    posted = res.ok;
  }
  return { id: doc.id, posted };
}

/** Позначає транзакцію результатом рознесення. */
async function markTxn(
  id: string,
  data: {
    matchStatus: string;
    matchedCustomerId?: string | null;
    bankPaymentIncomingId?: string | null;
    bankPaymentOutgoingId?: string | null;
    matchNote?: string | null;
  },
): Promise<void> {
  await prisma.bankTransaction.update({
    where: { id },
    data: { ...data, matchedAt: new Date() },
  });
}

async function handleIncoming(
  txn: PendingTxn,
  ctx: {
    expectations: OpenExpectationInput[];
    payerRequisites: PayerRequisiteInput[];
  },
  result: ReconcileResult,
): Promise<void> {
  const refs = extractDocRefs([txn.comment, txn.description]);
  const docRefs = refs.length > 0 ? await resolveDocRefs(refs) : [];

  const decision: MatchDecision = decide(
    collectSignals(
      {
        amount: txn.amount,
        currencyCode: txn.currencyCode,
        occurredAt: txn.occurredAt,
        counterIban: txn.counterIban,
        counterEdrpou: txn.counterEdrpou,
        counterName: txn.counterName,
        comment: txn.comment,
        description: txn.description,
      },
      { ...ctx, docRefs },
    ),
  );

  if (decision.action === "none" || !decision.customerId) {
    await markTxn(txn.id, {
      matchStatus: "unmatched",
      matchNote: decision.note,
    });
    result.unmatched++;
    return;
  }

  // Авто-проведення лише коли рахунок фіда привʼязано до обліку.
  const canPost = txn.feedAccount.mgrBankAccountId !== null;
  const wantPost = decision.action === "auto" && canPost;
  const note =
    decision.action === "auto" && !canPost
      ? `${decision.note} (рахунок фіда не привʼязано до обліку — лише чернетка)`
      : decision.note;

  const doc = await createIncomingFromTransaction({
    txn,
    customerId: decision.customerId,
    post: wantPost,
    note,
  });

  await markTxn(txn.id, {
    matchStatus: doc.posted ? "auto_posted" : "draft_created",
    matchedCustomerId: decision.customerId,
    bankPaymentIncomingId: doc.id,
    matchNote: note,
  });

  // Закрити очікування оплати.
  if (decision.expectationId) {
    await prisma.paymentExpectation
      .update({
        where: { id: decision.expectationId },
        data: {
          status: "matched",
          matchedTransactionId: txn.id,
          matchedAt: new Date(),
        },
      })
      .catch(() => undefined);
  }

  // Самонавчання: платник тепер відомий.
  if (doc.posted) {
    await learnPayerRequisite({
      customerId: decision.customerId,
      counterIban: txn.counterIban,
      counterEdrpou: txn.counterEdrpou,
      counterName: txn.counterName,
      note: "авто (воронка рознесення)",
    });
  }

  const managerUserId = await resolveManagerUserId(
    decision.customerId,
    decision.saleId ?? null,
  );
  const customer = await prisma.customer.findUnique({
    where: { id: decision.customerId },
    select: { name: true },
  });
  const sum = `${txn.amount.toLocaleString("uk-UA")} ${txn.currencyCode === "UAH" ? "грн" : txn.currencyCode}`;
  await notifyManager(
    managerUserId,
    doc.posted
      ? `Клієнт ${customer?.name ?? "?"} оплатив ${sum} — платіж проведено автоматично, борг зменшено (див. «Банк (рухи)»).`
      : `Надійшла оплата ${sum}, схоже від ${customer?.name ?? "?"} — створено чернетку платіжки, підтвердіть у «Платіжки вхідні».`,
  );

  if (doc.posted) result.autoPosted++;
  else result.drafts++;
}

async function handleOutgoing(
  txn: PendingTxn,
  result: ReconcileResult,
): Promise<void> {
  const articleId = await readSetting(AUTO_EXPENSE_ARTICLE_KEY);
  const canPost =
    articleId !== null && txn.feedAccount.mgrBankAccountId !== null;
  if (!canPost) {
    await markTxn(txn.id, {
      matchStatus: "unmatched",
      matchNote: articleId
        ? "Розхід: рахунок фіда не привʼязано до обліку"
        : "Розхід: статтю авто-розходу не налаштовано — рознесіть вручну",
    });
    result.unmatched++;
    return;
  }

  const rateEur = await getCurrentRate();
  const amount = Math.abs(txn.amount);
  const doc = await prisma.bankPaymentOutgoing.create({
    data: {
      bankAccountId: txn.feedAccount.mgrBankAccountId,
      cashFlowArticleId: articleId,
      amount,
      currency: txn.currencyCode === "EUR" ? "EUR" : "UAH",
      amountEur: computeAmountEur(
        amount,
        txn.currencyCode === "EUR" ? "EUR" : "UAH",
        rateEur,
      ),
      rateEur,
      iban: txn.counterIban,
      purpose: txn.comment ?? txn.description,
      comment: `Банківська виписка (${txn.provider}) — авто-розхід.`,
      paidAt: txn.occurredAt,
      status: "draft",
    },
    select: { id: true },
  });
  const res = await postBankPaymentOutgoing(doc.id);

  await markTxn(txn.id, {
    matchStatus: res.ok ? "auto_posted" : "unmatched",
    bankPaymentOutgoingId: doc.id,
    matchNote: res.ok
      ? "Авто-розхід за налаштованою статтею"
      : `Не вдалося провести: ${res.ok ? "" : res.error}`,
  });
  if (res.ok) result.expensesPosted++;
  else result.unmatched++;
}

/**
 * Обробляє чергу необроблених транзакцій (matchStatus="pending").
 * Викликається з крону bank-sync та (fire-and-forget) після вебхука.
 */
export async function reconcileBankTransactions(
  limit = DEFAULT_BATCH,
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    checked: 0,
    autoPosted: 0,
    drafts: 0,
    unmatched: 0,
    expensesPosted: 0,
    errors: 0,
  };

  // Протермінувати старі очікування (разово за прогін).
  await prisma.paymentExpectation
    .updateMany({
      where: { status: "open", expiresAt: { lt: new Date() } },
      data: { status: "expired" },
    })
    .catch(() => undefined);

  const rows = await prisma.bankTransaction.findMany({
    where: { matchStatus: "pending" },
    orderBy: { occurredAt: "asc" },
    take: limit,
    include: { feedAccount: { select: { mgrBankAccountId: true } } },
  });
  if (rows.length === 0) return result;

  // Спільний контекст батчу: відкриті очікування + вся памʼять платників.
  const [expectations, payerRequisites] = await Promise.all([
    prisma.paymentExpectation.findMany({
      where: { status: "open" },
      select: {
        id: true,
        customerId: true,
        saleId: true,
        amountUah: true,
        expiresAt: true,
      },
    }),
    prisma.clientPayerRequisite.findMany({
      select: { customerId: true, counterIban: true, counterEdrpou: true },
    }),
  ]);
  const ctx = {
    expectations: expectations.map((e) => ({
      ...e,
      amountUah: Number(e.amountUah),
    })),
    payerRequisites,
  };

  for (const row of rows) {
    result.checked++;
    const txn: PendingTxn = { ...row, amount: Number(row.amount) };
    try {
      if (txn.currencyCode === "USD") {
        await markTxn(txn.id, {
          matchStatus: "skipped",
          matchNote: "USD-операція — облік вручну (казначейські документи ₴/€)",
        });
        continue;
      }
      if (txn.amount > 0) {
        await handleIncoming(txn, ctx, result);
      } else if (txn.amount < 0) {
        await handleOutgoing(txn, result);
      } else {
        await markTxn(txn.id, {
          matchStatus: "skipped",
          matchNote: "Нульова сума",
        });
      }
    } catch (e: unknown) {
      result.errors++;
      console.error("[L-TEX] reconcileBankTransactions failed", {
        txnId: txn.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}
