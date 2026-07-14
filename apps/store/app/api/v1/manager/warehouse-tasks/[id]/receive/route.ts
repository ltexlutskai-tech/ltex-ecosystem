import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { notifyManagerAboutTask } from "@/lib/manager/warehouse-task";

const WAREHOUSE_ROLES = ["warehouse", "admin", "owner"];

/**
 * Склад прийняв завдання (status `new` → `received`). Записує хто/коли й
 * сповіщає менеджера («склад отримав завдання»).
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

  const task = await prisma.warehouseTask.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      managerUserId: true,
      customerName: true,
      sale: {
        select: { number1C: true, code1C: true, docNumber: true },
      },
    },
  });
  if (!task) {
    return NextResponse.json(
      { error: "Завдання не знайдено" },
      { status: 404 },
    );
  }
  if (task.status !== "new") {
    return NextResponse.json(
      { error: "Завдання вже в роботі" },
      { status: 409 },
    );
  }

  await prisma.warehouseTask.update({
    where: { id },
    data: {
      status: "received",
      receivedByUserId: user.id,
      receivedByName: user.fullName,
      receivedAt: new Date(),
    },
  });

  await notifyManagerAboutTask({
    managerUserId: task.managerUserId,
    customerName: task.customerName,
    saleRef: task.sale,
    kind: "received",
  });

  revalidatePath("/manager/warehouse-tasks");
  revalidatePath(`/manager/warehouse-tasks/${id}`);
  return NextResponse.json({ ok: true });
}
