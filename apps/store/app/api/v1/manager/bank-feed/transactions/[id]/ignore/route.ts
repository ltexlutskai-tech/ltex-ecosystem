import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageTreasury } from "@/lib/manager/treasury-permission";

/**
 * POST /api/v1/manager/bank-feed/transactions/[id]/ignore — свідомо не
 * розносити операцію (внутрішній переказ між своїми рахунками, комісія, яку
 * облікують інакше, тощо). Рознесені операції ігнорувати не можна.
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
  const txn = await prisma.bankTransaction.findUnique({
    where: { id },
    select: { matchStatus: true },
  });
  if (!txn) {
    return NextResponse.json(
      { error: "Транзакцію не знайдено" },
      { status: 404 },
    );
  }
  if (["auto_posted", "manual_posted"].includes(txn.matchStatus)) {
    return NextResponse.json(
      { error: "Транзакцію вже рознесено — ігнорувати не можна" },
      { status: 409 },
    );
  }

  await prisma.bankTransaction.update({
    where: { id },
    data: {
      matchStatus: "ignored",
      matchNote: `Проігноровано: ${user.fullName ?? user.id}`,
      matchedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
