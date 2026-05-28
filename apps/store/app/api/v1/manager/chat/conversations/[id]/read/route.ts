import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getConversationForUser } from "@/lib/chat/conversation-access";

/**
 * POST /api/v1/manager/chat/conversations/[id]/read
 *
 * Позначає вхідні повідомлення розмови як прочитані + обнуляє `unreadForManager`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const access = await getConversationForUser(user, id);
  if (access.status === 404) {
    return NextResponse.json({ error: "Розмову не знайдено" }, { status: 404 });
  }
  if (access.status === 403) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.chatInboxMessage.updateMany({
      where: { conversationId: id, direction: "in", isRead: false },
      data: { isRead: true },
    }),
    prisma.chatConversation.update({
      where: { id },
      data: { unreadForManager: 0 },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
