import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/users — легкий список активних користувачів (id +
 * fullName) для пікерів (наприклад «Експедитор» у маршрутному листі).
 *
 * Доступний усім авторизованим менеджерам (на відміну від admin-only
 * `/admin/users` з повними даними). Віддає лише мінімум для вибору.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, role: true },
  });

  const response = NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      role: u.role,
    })),
  });
  response.headers.set(
    "Cache-Control",
    "private, max-age=60, stale-while-revalidate=60",
  );
  return response;
}
