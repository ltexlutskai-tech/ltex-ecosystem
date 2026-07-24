import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageTreasury } from "@/lib/manager/treasury-permission";

const linkSchema = z.object({
  feedAccountId: z.string().min(1),
  // null → відв'язати від довідника.
  mgrBankAccountId: z.string().min(1).nullable(),
});

/**
 * POST /api/v1/manager/bank-feed/link — привʼязка рахунку з банківського фіда
 * до нашого довідника рахунків (MgrBankAccount). Потрібна для Кроку 3
 * (авто-створення платіжок на правильний рахунок). Доступ — фінансовий контур.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canManageTreasury(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }

  const parsed = linkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некоректні дані" }, { status: 400 });
  }
  const { feedAccountId, mgrBankAccountId } = parsed.data;

  const feed = await prisma.bankFeedAccount.findUnique({
    where: { id: feedAccountId },
    select: { id: true },
  });
  if (!feed) {
    return NextResponse.json(
      { error: "Рахунок фіда не знайдено" },
      { status: 404 },
    );
  }

  if (mgrBankAccountId) {
    const acc = await prisma.mgrBankAccount.findUnique({
      where: { id: mgrBankAccountId },
      select: { id: true },
    });
    if (!acc) {
      return NextResponse.json(
        { error: "Рахунок довідника не знайдено" },
        { status: 404 },
      );
    }
  }

  await prisma.bankFeedAccount.update({
    where: { id: feedAccountId },
    data: { mgrBankAccountId },
  });

  return NextResponse.json({ ok: true });
}
