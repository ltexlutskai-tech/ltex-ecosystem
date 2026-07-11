import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMessengerConversationForUser } from "@/lib/messenger/access";
import {
  isAllowedReaction,
  summarizeReactions,
} from "@/lib/messenger/reactions";

const bodySchema = z.object({ emoji: z.string().min(1).max(16) });

/**
 * POST /api/v1/manager/messenger/conversations/[id]/messages/[messageId]/reactions
 *
 * Перемикнути реакцію (є → прибрати, немає → додати). Повертає оновлене
 * зведення реакцій повідомлення.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id, messageId } = await params;
  const access = await getMessengerConversationForUser(user, id);
  if (access.status === 404) {
    return NextResponse.json({ error: "Розмову не знайдено" }, { status: 404 });
  }
  if (access.status === 403 || !access.membership) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || !isAllowedReaction(parsed.data.emoji)) {
    return NextResponse.json({ error: "Невірна реакція" }, { status: 400 });
  }
  const emoji = parsed.data.emoji;

  const msg = await prisma.messengerMessage.findFirst({
    where: { id: messageId, conversationId: id },
    select: { id: true, kind: true, deletedAt: true },
  });
  if (!msg || msg.kind === "system" || msg.deletedAt) {
    return NextResponse.json(
      { error: "Реакція недоступна для цього повідомлення" },
      { status: 400 },
    );
  }

  const existing = await prisma.messengerReaction.findUnique({
    where: {
      messageId_userId_emoji: { messageId, userId: user.id, emoji },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.messengerReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.messengerReaction.create({
      data: { messageId, userId: user.id, emoji },
    });
  }

  const rows = await prisma.messengerReaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
  });

  return NextResponse.json({
    reactions: summarizeReactions(rows, user.id),
  });
}
