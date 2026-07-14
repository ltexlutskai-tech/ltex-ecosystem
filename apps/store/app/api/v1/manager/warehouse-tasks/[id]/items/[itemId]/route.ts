import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

const WAREHOUSE_ROLES = ["warehouse", "admin", "owner"];

/**
 * Позначити позицію завдання як запаковану/не запаковану (`packed`).
 * Склад відмічає підготовлені лоти.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!WAREHOUSE_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }
  const { id, itemId } = await params;

  const body = (await req.json().catch(() => ({}))) as { packed?: boolean };

  const item = await prisma.warehouseTaskItem.findFirst({
    where: { id: itemId, taskId: id },
    select: { id: true },
  });
  if (!item) {
    return NextResponse.json({ error: "Позицію не знайдено" }, { status: 404 });
  }

  await prisma.warehouseTaskItem.update({
    where: { id: itemId },
    data: { packed: Boolean(body.packed) },
  });

  revalidatePath(`/manager/warehouse-tasks/${id}`);
  return NextResponse.json({ ok: true });
}
