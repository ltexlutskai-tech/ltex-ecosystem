import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getConversationForUser } from "@/lib/chat/conversation-access";
import { getPlatformSender } from "@/lib/chat/platform-send";

const messageBodySchema = z.object({
  text: z.string().trim().min(1, "Текст не може бути порожнім").max(4000),
});

/**
 * POST /api/v1/manager/chat/conversations/[id]/messages
 *
 * Менеджер відповідає клієнту:
 *   1. Перевірка прав (`agentUserId === user.id` АБО admin АБО (agentUserId IS NULL → будь-який менеджер)).
 *   2. Виклик platform-send → отримуємо optional externalMessageId.
 *   3. Зберігаємо `ChatInboxMessage` (direction `out`, sender `manager`).
 *   4. Бамп `lastMessageAt = now`.
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
  const conv = access.conversation;

  const body = await req.json().catch(() => null);
  const parsed = messageBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const text = parsed.data.text;

  // Send via platform; на помилці платформи зберігаємо повідомлення без externalMessageId.
  const sendResult = await getPlatformSender(conv.platform).send(
    conv.externalUserId,
    text,
  );

  const created = await prisma.chatInboxMessage.create({
    data: {
      conversationId: conv.conversationId,
      direction: "out",
      sender: "manager",
      text,
      authorUserId: user.id,
      externalMessageId: sendResult.externalMessageId ?? null,
      isRead: true,
    },
  });

  await prisma.chatConversation.update({
    where: { id: conv.conversationId },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json(
    {
      message: {
        id: created.id,
        conversationId: created.conversationId,
        direction: created.direction,
        sender: created.sender,
        text: created.text,
        mediaUrl: created.mediaUrl,
        externalMessageId: created.externalMessageId,
        authorUserId: created.authorUserId,
        isRead: created.isRead,
        createdAt: created.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
