import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

export const dynamic = "force-dynamic";

const WAREHOUSE_ROLES = ["warehouse", "admin", "owner"];

/**
 * Кількість відкритих завдань складу (new + received) — для індикатора у
 * сайдбарі. Видно складу/адміну/власнику; іншим — 0.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!WAREHOUSE_ROLES.includes(user.role)) {
    return NextResponse.json({ open: 0 });
  }
  const open = await prisma.warehouseTask.count({
    where: {
      status: { in: ["new", "received"] },
      // Реалізації, які менеджер видалив «у себе», не рахуємо.
      sale: { markedForDeletion: false },
    },
  });
  return NextResponse.json({ open });
}
