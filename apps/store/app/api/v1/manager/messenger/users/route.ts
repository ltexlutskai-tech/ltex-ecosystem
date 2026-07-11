import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import type { MessengerUserBrief } from "@/lib/messenger/types";

/**
 * GET /api/v1/manager/messenger/users
 *
 * Список колег для початку чату — усі активні користувачі, крім себе.
 * Параметр `q` — фільтр за ім'ям (необов'язковий).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      id: { not: user.id },
      ...(q ? { fullName: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { fullName: "asc" },
    take: 100,
    select: { id: true, fullName: true, role: true, lastSeenAt: true },
  });

  const result: MessengerUserBrief[] = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    role: u.role,
    lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
  }));

  return NextResponse.json({ users: result });
}
