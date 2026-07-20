import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { notifyManagerAboutTask } from "@/lib/manager/warehouse-task";

const WAREHOUSE_ROLES = ["warehouse", "admin", "owner"];

/**
 * Склад завершив (запаковано + ТТН створено): status → `sent`. Записує хто/коли,
 * прапор `ttnConfirmed` і трек-номер (за потреби), сповіщає менеджера
 * («посилку відправлено»).
 */
export async function POST(
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

  const body = (await req.json().catch(() => ({}))) as {
    expressWaybill?: string;
  };

  const task = await prisma.warehouseTask.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      managerUserId: true,
      customerName: true,
      labelPrintedAt: true,
      sale: {
        select: { number1C: true, code1C: true, docNumber: true, ttnRef: true },
      },
    },
  });
  if (!task) {
    return NextResponse.json(
      { error: "Завдання не знайдено" },
      { status: 404 },
    );
  }
  if (task.status === "sent") {
    return NextResponse.json(
      { error: "Завдання вже відправлено" },
      { status: 409 },
    );
  }
  // Для відправлень Новою Поштою «Готово» доступне лише після друку етикетки.
  if (task.sale?.ttnRef && !task.labelPrintedAt) {
    return NextResponse.json(
      { error: "Спершу надрукуйте етикетку Нової Пошти." },
      { status: 400 },
    );
  }

  await prisma.warehouseTask.update({
    where: { id },
    data: {
      status: "sent",
      ttnConfirmed: true,
      sentByUserId: user.id,
      sentByName: user.fullName,
      sentAt: new Date(),
      ...(body.expressWaybill?.trim()
        ? { expressWaybill: body.expressWaybill.trim() }
        : {}),
    },
  });

  await notifyManagerAboutTask({
    managerUserId: task.managerUserId,
    customerName: task.customerName,
    saleRef: task.sale,
    kind: "sent",
  });

  revalidatePath("/manager/warehouse-tasks");
  revalidatePath(`/manager/warehouse-tasks/${id}`);
  return NextResponse.json({ ok: true });
}
