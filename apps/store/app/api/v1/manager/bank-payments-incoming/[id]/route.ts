import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageTreasury } from "@/lib/manager/treasury-permission";

/** GET деталей вхідної платіжки. */
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
  const doc = await prisma.bankPaymentIncoming.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      bankAccountRef: { select: { name: true } },
      cashFlowArticleRef: { select: { name: true } },
    },
  });
  if (!doc) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  return NextResponse.json({ doc });
}

/**
 * Видалення вхідної платіжки. Дозволено лише для `draft` або `cancelled`
 * (проведений документ спершу скасувати). Рухи ДДС/боргу скасування вже прибрало.
 */
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
  const doc = await prisma.bankPaymentIncoming.findUnique({
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

  await prisma.bankPaymentIncoming.delete({ where: { id } });
  revalidatePath("/manager/bank-payments-incoming");
  return NextResponse.json({ ok: true });
}
