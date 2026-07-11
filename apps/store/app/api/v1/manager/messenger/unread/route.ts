import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { countUnread } from "@/lib/messenger/access";

/**
 * GET /api/v1/manager/messenger/unread
 *
 * Сумарна кількість непрочитаних повідомлень у всіх моїх розмовах — для бейджа
 * у меню й дзвіночка.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const memberships = await prisma.messengerMember.findMany({
    where: { userId: user.id, leftAt: null },
    select: { conversationId: true, lastReadAt: true },
  });

  const counts = await Promise.all(
    memberships.map((m) =>
      countUnread(m.conversationId, user.id, m.lastReadAt),
    ),
  );
  const total = counts.reduce((sum, n) => sum + n, 0);

  return NextResponse.json({ total });
}
