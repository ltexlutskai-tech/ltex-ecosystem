import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageTreasury } from "@/lib/manager/treasury-permission";
import { updateCashTransferDraft } from "@/lib/manager/treasury-posting";
import { cashTransferDraftSchema } from "@/lib/validations/manager-treasury";

/**
 * PATCH переміщення готівки — автозбереження чернетки (`draft:true`). Оновлює
 * лише `draft`-документ (проведений/скасований — 409), БЕЗ рухів ДДС.
 */
export async function PATCH(
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
  const doc = await prisma.cashTransfer.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  if (doc.status !== "draft") {
    return NextResponse.json(
      { error: "Документ уже проведено — редагування заборонено" },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = cashTransferDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  try {
    const draft = await updateCashTransferDraft(id, parsed.data);
    return NextResponse.json({ id: draft.id, status: draft.status });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: "Невалідні дані" }, { status: 400 });
    }
    console.error("[L-TEX] CashTransfer draft update failed", {
      docId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка збереження чернетки" },
      { status: 500 },
    );
  }
}

/** GET деталей переміщення готівки. */
export async function GET(
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
  const doc = await prisma.cashTransfer.findUnique({
    where: { id },
    include: {
      fromAccountRef: { select: { name: true } },
      toAccountRef: { select: { name: true } },
      cashFlowArticleRef: { select: { name: true } },
    },
  });
  if (!doc) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  return NextResponse.json({ doc });
}

/** Видалення переміщення (лише `draft`/`cancelled`). */
export async function DELETE(
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
  const doc = await prisma.cashTransfer.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  if (doc.status === "posted") {
    return NextResponse.json(
      { error: "Спершу скасуйте проведення документа" },
      { status: 409 },
    );
  }

  await prisma.cashTransfer.delete({ where: { id } });
  revalidatePath("/manager/cash-transfers");
  return NextResponse.json({ ok: true });
}
