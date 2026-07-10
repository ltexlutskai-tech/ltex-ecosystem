import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { isRouteSheetLocked } from "@/lib/manager/route-sheet-status";
import { routeSheetExpenseSchema } from "@/lib/validations/manager-route-sheet";
import { removeExpenseMovementSafe } from "@/lib/manager/route-sheet-expenses";

/**
 * Витрати маршрутного листа (Блок Б) — ручні рядки «стаття + сума». Авто-рядок
 * «Пальне/пробіг» (isMileage=true) керується кілометражем і тут не редагується.
 * Блокується, коли МЛ завершено (lock).
 */

async function guardEditable(id: string): Promise<NextResponse | null> {
  const sheet = await prisma.routeSheet.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!sheet) {
    return NextResponse.json(
      { error: "Маршрутний лист не знайдено" },
      { status: 404 },
    );
  }
  if (isRouteSheetLocked(sheet.status)) {
    return NextResponse.json(
      { error: "Маршрутний лист завершено — редагування заборонено" },
      { status: 409 },
    );
  }
  return null;
}

/** POST — додати ручний рядок витрат. Body: `{ articleName?, cashFlowArticleId?, currency?, amount }`. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const guard = await guardEditable(id);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const parsed = routeSheetExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const expense = await prisma.routeSheetExpense.create({
    data: {
      routeSheetId: id,
      isMileage: false,
      articleName: parsed.data.articleName ?? null,
      cashFlowArticleId: parsed.data.cashFlowArticleId ?? null,
      currency: parsed.data.currency ?? "UAH",
      amount: parsed.data.amount,
    },
    select: {
      id: true,
      articleName: true,
      cashFlowArticleId: true,
      currency: true,
      isMileage: true,
      amount: true,
      cashFlowArticle: { select: { name: true } },
    },
  });

  return NextResponse.json({
    expense: {
      id: expense.id,
      articleName: expense.articleName,
      cashFlowArticleId: expense.cashFlowArticleId,
      cashFlowArticleName: expense.cashFlowArticle?.name ?? null,
      currency: expense.currency ?? "UAH",
      isMileage: expense.isMileage,
      amount: expense.amount,
    },
  });
}

/** DELETE — прибрати ручний рядок витрат. Query: `?expenseId=`. Авто-рядок пробігу не видаляється. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const guard = await guardEditable(id);
  if (guard) return guard;

  const expenseId =
    new URL(req.url).searchParams.get("expenseId")?.trim() ?? "";
  if (!expenseId) {
    return NextResponse.json(
      { error: "Не вказано expenseId" },
      { status: 400 },
    );
  }

  // Лише ручні рядки (isMileage=false) — авто-рядок пробігу керується кілометражем.
  const result = await prisma.routeSheetExpense.deleteMany({
    where: { id: expenseId, routeSheetId: id, isMileage: false },
  });

  if (result.count > 0) removeExpenseMovementSafe(expenseId);

  return NextResponse.json({ ok: true, deleted: result.count });
}
