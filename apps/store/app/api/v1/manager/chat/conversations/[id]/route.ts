import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getConversationForUser } from "@/lib/chat/conversation-access";

/**
 * GET /api/v1/manager/chat/conversations/[id]
 *
 * Заголовок розмови + останні N повідомлень (default 50, пагінація через `before`
 * — ISO дата `createdAt` найстарішого видимого; повертає попередню сторінку).
 */
export async function GET(
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

  const url = new URL(req.url);
  const takeRaw = Number(url.searchParams.get("take") ?? 50);
  const take = Math.min(200, Math.max(1, takeRaw || 50));
  const before = url.searchParams.get("before");
  const beforeDate = before ? new Date(before) : null;

  const [conversation, messages] = await Promise.all([
    prisma.chatConversation.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        agent: { select: { id: true, fullName: true } },
      },
    }),
    prisma.chatInboxMessage.findMany({
      where: {
        conversationId: id,
        ...(beforeDate && !Number.isNaN(beforeDate.getTime())
          ? { createdAt: { lt: beforeDate } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
  ]);

  if (!conversation) {
    return NextResponse.json({ error: "Розмову не знайдено" }, { status: 404 });
  }

  // Повертаємо у хронологічному порядку (oldest-first).
  const ordered = [...messages].reverse();

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      platform: conversation.platform,
      externalUserId: conversation.externalUserId,
      externalUserName: conversation.externalUserName,
      phone: conversation.phone,
      clientId: conversation.clientId,
      agentUserId: conversation.agentUserId,
      status: conversation.status,
      unreadForManager: conversation.unreadForManager,
      lastMessageAt: conversation.lastMessageAt.toISOString(),
      createdAt: conversation.createdAt.toISOString(),
      client: conversation.client,
      agent: conversation.agent,
    },
    messages: ordered.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      sender: m.sender,
      text: m.text,
      mediaUrl: m.mediaUrl,
      externalMessageId: m.externalMessageId,
      authorUserId: m.authorUserId,
      isRead: m.isRead,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
