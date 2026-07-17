import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canView } from "@/lib/permissions/role-permissions";

/**
 * GET /api/v1/manager/chat/unread
 *
 * Сумарна кількість непрочитаних повідомлень для поточного користувача.
 * Скоуп — той самий, що у списку розмов (ТЗ 2026-07-17):
 * - повний доступ (chat view:all) → сума по всіх розмовах;
 * - менеджер (chat view:mine) → лише призначені йому АБО зі своїм клієнтом.
 *
 * Light-aggregate — для бейджа в боковій панелі (polling кожні 30с).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const chatScope = canView({ role: user.role }, "chat").scope;
  const where: Prisma.ChatConversationWhereInput =
    chatScope === "all"
      ? {}
      : {
          OR: [{ agentUserId: user.id }, { client: { agentUserId: user.id } }],
        };

  const result = await prisma.chatConversation.aggregate({
    where,
    _sum: { unreadForManager: true },
  });

  const total = result._sum.unreadForManager ?? 0;
  return NextResponse.json({ total });
}
