import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMessengerConversationForUser } from "@/lib/messenger/access";

/**
 * POST /api/v1/manager/messenger/conversations/[id]/messages/[messageId]/pin
 *
 * Закріпити / відкріпити повідомлення (toggle). Дозволено активним учасникам.
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

  const msg = await prisma.messengerMessage.findFirst({
    where: { id: messageId, conversationId: id },
    select: { pinnedAt: true, kind: true, deletedAt: true },
  });
  if (!msg || msg.kind === "system" || msg.deletedAt) {
    return NextResponse.json(
      { error: "Це повідомлення не можна закріпити" },
      { status: 400 },
    );
  }

  const pinnedAt = msg.pinnedAt ? null : new Date();
  await prisma.messengerMessage.update({
    where: { id: messageId },
    data: { pinnedAt },
  });

  return NextResponse.json({
    pinnedAt: pinnedAt ? pinnedAt.toISOString() : null,
  });
}
