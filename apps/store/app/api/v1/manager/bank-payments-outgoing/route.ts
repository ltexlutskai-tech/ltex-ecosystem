import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageTreasury } from "@/lib/manager/treasury-permission";
import {
  computeAmountEur,
  createBankPaymentOutgoingDraft,
} from "@/lib/manager/treasury-posting";
import {
  bankPaymentDraftSchema,
  createBankPaymentOutgoingSchema,
} from "@/lib/validations/manager-treasury";

const DEFAULT_PAGE_SIZE = 20;

/**
 * Задача D — Платіжки вихідні (оплата постачальнику / вихідний платіж). Список з
 * пагінацією + фільтром статусу. Доступ — admin/owner/bookkeeper.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canManageTreasury(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const pageNum = Number.parseInt(url.searchParams.get("page") ?? "", 10);
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const pageSize = DEFAULT_PAGE_SIZE;

  const where: Prisma.BankPaymentOutgoingWhereInput = {};
  if (status && ["draft", "posted", "cancelled"].includes(status)) {
    where.status = status;
  }

  const [items, total] = await Promise.all([
    prisma.bankPaymentOutgoing.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true } },
        bankAccountRef: { select: { name: true } },
        cashFlowArticleRef: { select: { name: true } },
      },
    }),
    prisma.bankPaymentOutgoing.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}

/** Створення чернетки вихідної платіжки. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canManageTreasury(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  // ─── Автозбереження чернетки (draft) ──────────────────────────────────────
  if (body && typeof body === "object" && (body as { draft?: unknown }).draft) {
    const parsedDraft = bankPaymentDraftSchema.safeParse(body);
    if (!parsedDraft.success) {
      return NextResponse.json(
        {
          error: "Невірні дані",
          details: parsedDraft.error.issues.slice(0, 5),
        },
        { status: 400 },
      );
    }
    try {
      const draft = await createBankPaymentOutgoingDraft(
        parsedDraft.data,
        user.id,
      );
      return NextResponse.json(
        { id: draft.id, status: draft.status },
        { status: 201 },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        return NextResponse.json({ error: "Невалідні дані" }, { status: 400 });
      }
      console.error("[L-TEX] BankPaymentOutgoing draft create failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: "Помилка збереження чернетки" },
        { status: 500 },
      );
    }
  }

  const parsed = createBankPaymentOutgoingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const amountEur = computeAmountEur(
    input.amount,
    input.currency,
    input.rateEur,
  );
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

  try {
    const created = await prisma.bankPaymentOutgoing.create({
      data: {
        customerId: input.customerId ?? null,
        bankAccountId: input.bankAccountId,
        cashFlowArticleId: input.cashFlowArticleId,
        amount: input.amount,
        currency: input.currency,
        amountEur,
        rateEur: input.rateEur,
        iban: input.iban ?? null,
        purpose: input.purpose ?? null,
        comment: input.comment ?? null,
        paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
        status: "draft",
        createdByUserId: user.id,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: "Невалідні дані" }, { status: 400 });
    }
    console.error("[L-TEX] BankPaymentOutgoing create failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка створення документа" },
      { status: 500 },
    );
  }
}
