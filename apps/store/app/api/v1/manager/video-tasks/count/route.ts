import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/video-tasks/count
 *
 * Лічильник відкритих відеозавдань «на мене» для бейджа сайдбару:
 *  • відеозона / admin / owner → усі активні (`new` + `filming`);
 *  • склад → завдання, що чекають мішка (`new`);
 *  • менеджер → свої незавершені завдання (замовник).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ total: 0 }, { status: 200 });
  }

  let where: Record<string, unknown>;
  if (["videozone", "admin", "owner"].includes(user.role)) {
    where = { status: { in: ["new", "filming"] } };
  } else if (user.role === "warehouse") {
    where = { status: "new" };
  } else {
    where = { managerUserId: user.id, status: { in: ["new", "filming"] } };
  }

  const total = await prisma.mgrVideoTask.count({ where });
  return NextResponse.json({ total }, { status: 200 });
}
