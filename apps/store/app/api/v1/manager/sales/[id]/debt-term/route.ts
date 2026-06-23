import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canViewSale } from "@/lib/manager/sale-ownership";

const debtTermSchema = z
  .object({
    debtTermDays: z.number().int().nonnegative().max(3650).nullable(),
  })
  .strict();

/**
 * PATCH /api/v1/manager/sales/[id]/debt-term
 *
 * Окремий ендпоінт для встановлення відстрочки боргу («днів до закриття») на
 * документі реалізації. Оновлює ВИКЛЮЧНО `Sale.debtTermDays` і НЕ міняє статус.
 *
 * ⚠️ Свідомо НЕ перевіряє posted-lock (на відміну від основного PATCH /sales/[id]):
 * борг живе на ПРОВЕДЕНИХ документах, тому менеджер мусить мати змогу
 * скоригувати відстрочку навіть після проведення/архівації. Поле не є частиною
 * 1С-документа і не впливає на проведення — лише на звіт «Прострочені борги».
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  // Ownership: manager — лише свої реалізації; admin — будь-яку.
  const ok = await canViewSale(user, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = debtTermSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  try {
    const sale = await prisma.sale.update({
      where: { id },
      data: { debtTermDays: parsed.data.debtTermDays },
      select: { id: true, debtTermDays: true },
    });
    return NextResponse.json({
      id: sale.id,
      debtTermDays: sale.debtTermDays,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Реалізацію не знайдено" },
        { status: 404 },
      );
    }
    console.error("[L-TEX] Sale debt-term update failed", {
      saleId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка оновлення відстрочки" },
      { status: 500 },
    );
  }
}
