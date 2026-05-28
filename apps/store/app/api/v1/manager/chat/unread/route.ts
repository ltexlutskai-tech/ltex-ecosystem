import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/chat/unread
 *
 * Сумарна кількість непрочитаних повідомлень для поточного користувача.
 * - admin → сума `unreadForManager` по всіх розмовах.
 * - manager → лише по розмовах, де `agentUserId = user.id` АБО `agentUserId IS NULL`
 *   (нерозподілені = спільний пул).
 *
 * Light-aggregate — для бейджа в боковій панелі (polling кожні 30с).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const where: Prisma.ChatConversationWhereInput =
    user.role === "admin"
      ? {}
      : { OR: [{ agentUserId: user.id }, { agentUserId: null }] };

  const result = await prisma.chatConversation.aggregate({
    where,
    _sum: { unreadForManager: true },
  });

  const total = result._sum.unreadForManager ?? 0;
  return NextResponse.json({ total });
}
