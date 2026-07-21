import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canViewSale } from "@/lib/manager/sale-ownership";
import { createCheckboxReceiptForSale } from "@/lib/fiscal/create-receipt-for-sale";

/**
 * POST /api/v1/manager/sales/[id]/create-receipt
 *
 * Ручне (повторне) створення чека Checkbox (ETTN) для NovaPay-накладки —
 * кнопка «Повторити чек», коли авто-створення на «Готово» впало. Ідемпотентно
 * (не дублює вже створений чек). Повертає поточний стан чека.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const { id } = await params;

  const ok = await canViewSale(user, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  const result = await createCheckboxReceiptForSale(id);

  const receipt = await prisma.checkboxReceipt.findUnique({
    where: { saleId: id },
    select: { status: true, receiptId: true, error: true },
  });

  return NextResponse.json({
    ok: result.ok,
    skipped: result.skipped ?? false,
    error: result.error ?? receipt?.error ?? null,
    status: receipt?.status ?? null,
    receiptId: receipt?.receiptId ?? null,
  });
}
