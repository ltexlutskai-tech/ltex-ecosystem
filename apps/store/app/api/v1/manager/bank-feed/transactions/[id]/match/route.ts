import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageTreasury } from "@/lib/manager/treasury-permission";
import {
  resolveCustomerForOrder,
  ResolveCustomerError,
} from "@/lib/manager/resolve-customer";
import {
  createIncomingFromTransaction,
  learnPayerRequisite,
} from "@/lib/bank/reconcile";
import { getCurrentRate } from "@/lib/exchange-rate";
import {
  computeAmountEur,
  postBankPaymentIncoming,
  postBankPaymentOutgoing,
} from "@/lib/manager/treasury-posting";

const matchSchema = z.object({
  /** ПРИХІД: клієнт (MgrClient.id з ClientPicker або Customer.id). */
  clientId: z.string().min(1).optional(),
  /** Запамʼятати платника (IBAN/ЄДРПОУ → клієнт) для авто-рознесення далі. */
  remember: z.boolean().optional(),
  /** РОЗХІД: стаття ДДС. */
  cashFlowArticleId: z.string().min(1).optional(),
});

/**
 * POST /api/v1/manager/bank-feed/transactions/[id]/match — ручне рознесення
 * з дошки «Нерознесені гроші»: прихід → створити+провести вхідну платіжку на
 * обраного клієнта (борг ↓); розхід → створити+провести вихідну платіжку з
 * обраною статтею. Доступ — фінансовий контур.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canManageTreasury(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = matchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некоректні дані" }, { status: 400 });
  }

  const txnRow = await prisma.bankTransaction.findUnique({
    where: { id },
    include: { feedAccount: { select: { mgrBankAccountId: true } } },
  });
  if (!txnRow) {
    return NextResponse.json(
      { error: "Транзакцію не знайдено" },
      { status: 404 },
    );
  }
  if (["auto_posted", "manual_posted"].includes(txnRow.matchStatus)) {
    return NextResponse.json(
      { error: "Транзакцію вже рознесено" },
      { status: 409 },
    );
  }
  if (!txnRow.feedAccount.mgrBankAccountId) {
    return NextResponse.json(
      {
        error:
          "Рахунок фіда не привʼязано до довідника рахунків — привʼяжіть його на сторінці «Банк» і повторіть",
      },
      { status: 400 },
    );
  }

  const amount = Number(txnRow.amount);
  const txn = { ...txnRow, amount };

  // ── ПРИХІД → вхідна платіжка на клієнта ────────────────────────────────
  if (amount > 0) {
    if (!parsed.data.clientId) {
      return NextResponse.json({ error: "Оберіть клієнта" }, { status: 400 });
    }
    let customer;
    try {
      customer = await resolveCustomerForOrder(parsed.data.clientId);
    } catch (e: unknown) {
      if (e instanceof ResolveCustomerError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    const doc = await createIncomingFromTransaction({
      txn,
      customerId: customer.id,
      post: true,
      note: `Рознесено вручну (${user.fullName ?? user.id})`,
      createdByUserId: user.id,
    });
    if (!doc.posted) {
      return NextResponse.json(
        { error: "Не вдалося провести платіжку" },
        { status: 500 },
      );
    }

    await prisma.bankTransaction.update({
      where: { id },
      data: {
        matchStatus: "manual_posted",
        matchedCustomerId: customer.id,
        bankPaymentIncomingId: doc.id,
        matchNote: `Вручну: ${user.fullName ?? user.id}`,
        matchedAt: new Date(),
      },
    });

    if (parsed.data.remember !== false) {
      await learnPayerRequisite({
        customerId: customer.id,
        counterIban: txnRow.counterIban,
        counterEdrpou: txnRow.counterEdrpou,
        counterName: txnRow.counterName,
        createdByUserId: user.id,
        note: "ручне рознесення з дошки",
      });
    }

    return NextResponse.json({ ok: true, bankPaymentIncomingId: doc.id });
  }

  // ── РОЗХІД → вихідна платіжка зі статтею ───────────────────────────────
  if (!parsed.data.cashFlowArticleId) {
    return NextResponse.json(
      { error: "Оберіть статтю руху коштів" },
      { status: 400 },
    );
  }
  const article = await prisma.mgrCashFlowArticle.findUnique({
    where: { id: parsed.data.cashFlowArticleId },
    select: { id: true },
  });
  if (!article) {
    return NextResponse.json({ error: "Статтю не знайдено" }, { status: 404 });
  }

  const rateEur = await getCurrentRate();
  const absAmount = Math.abs(amount);
  const currency = txnRow.currencyCode === "EUR" ? "EUR" : "UAH";
  const doc = await prisma.bankPaymentOutgoing.create({
    data: {
      bankAccountId: txnRow.feedAccount.mgrBankAccountId,
      cashFlowArticleId: article.id,
      amount: absAmount,
      currency,
      amountEur: computeAmountEur(absAmount, currency, rateEur),
      rateEur,
      iban: txnRow.counterIban,
      purpose: txnRow.comment ?? txnRow.description,
      comment: `Банківська виписка (${txnRow.provider}) — рознесено вручну.`,
      paidAt: txnRow.occurredAt,
      status: "draft",
      createdByUserId: user.id,
    },
    select: { id: true },
  });
  const res = await postBankPaymentOutgoing(doc.id);
  if (!res.ok) {
    return NextResponse.json(
      { error: "Не вдалося провести платіжку" },
      { status: 500 },
    );
  }

  await prisma.bankTransaction.update({
    where: { id },
    data: {
      matchStatus: "manual_posted",
      bankPaymentOutgoingId: doc.id,
      matchNote: `Вручну (розхід): ${user.fullName ?? user.id}`,
      matchedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, bankPaymentOutgoingId: doc.id });
}
