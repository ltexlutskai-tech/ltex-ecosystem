import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { fetchMarkingPdf } from "@/lib/delivery/nova-poshta";

const WAREHOUSE_ROLES = ["warehouse", "admin", "owner"];

/**
 * GET /api/v1/manager/warehouse-tasks/[id]/label
 *
 * Друк етикетки НП (маркування 100×100) з нашої системи — щоб склад не заходив у
 * кабінет НП. PDF тягнеться на СЕРВЕРІ (ключ прихований) і стрімиться складу.
 * Після успішного отримання PDF позначаємо `labelPrintedAt` — тоді у завданні
 * стає доступною кнопка «Готово».
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!WAREHOUSE_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }
  const { id } = await params;

  const task = await prisma.warehouseTask.findUnique({
    where: { id },
    select: {
      id: true,
      sale: { select: { ttnRef: true, expressWaybill: true } },
    },
  });
  if (!task) {
    return NextResponse.json(
      { error: "Завдання не знайдено" },
      { status: 404 },
    );
  }
  const ref = task.sale?.ttnRef;
  if (!ref) {
    return NextResponse.json(
      { error: "ТТН ще не створено — спершу створіть ТТН у реалізації." },
      { status: 400 },
    );
  }

  const result = await fetchMarkingPdf(ref);
  if ("error" in result) {
    return NextResponse.json(
      { error: `Не вдалося отримати етикетку: ${result.error}` },
      { status: 502 },
    );
  }

  // Позначаємо, що етикетку надруковано (best-effort — не блокує віддачу PDF).
  await prisma.warehouseTask
    .update({ where: { id }, data: { labelPrintedAt: new Date() } })
    .catch(() => undefined);

  const filename = task.sale?.expressWaybill
    ? `label-${task.sale.expressWaybill}.pdf`
    : "label.pdf";
  return new NextResponse(Buffer.from(result.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
