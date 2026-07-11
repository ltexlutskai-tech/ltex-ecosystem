import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMessengerConversationForUser } from "@/lib/messenger/access";
import { serializeMessage } from "@/lib/messenger/serialize";

const bodySchema = z.object({
  toConversationId: z.string().min(1, "Не вказано розмову"),
});

/**
 * POST /api/v1/manager/messenger/conversations/[id]/messages/[messageId]/forward
 *
 * Переслати повідомлення в іншу розмову. Копіює текст, вкладення та посилання
 * на документ; підпис «Переслано від …» зберігає першоджерело.
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

  // Доступ до розмови-джерела.
  const src = await getMessengerConversationForUser(user, id);
  if (src.status === 404) {
    return NextResponse.json({ error: "Розмову не знайдено" }, { status: 404 });
  }
  if (src.status === 403 || !src.membership) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }
  const targetId = parsed.data.toConversationId;

  // Мушу бути учасником розмови-цілі.
  const dst = await getMessengerConversationForUser(user, targetId);
  if (dst.status !== 200 || !dst.membership) {
    return NextResponse.json(
      { error: "Немає доступу до цільової розмови" },
      { status: 403 },
    );
  }

  const source = await prisma.messengerMessage.findFirst({
    where: { id: messageId, conversationId: id },
    include: {
      attachments: true,
      author: { select: { fullName: true } },
    },
  });
  if (!source || source.deletedAt || source.kind === "system") {
    return NextResponse.json(
      { error: "Це повідомлення не можна переслати" },
      { status: 400 },
    );
  }

  const origin = source.forwardedFrom ?? source.author?.fullName ?? "Невідомо";

  const now = new Date();
  const created = await prisma.messengerMessage.create({
    data: {
      conversationId: targetId,
      authorId: user.id,
      kind: "text",
      text: source.text,
      forwardedFrom: origin,
      ...(source.docRef !== null && source.docRef !== undefined
        ? { docRef: source.docRef }
        : {}),
      attachments: {
        create: source.attachments.map((a) => ({
          kind: a.kind,
          url: a.url,
          name: a.name,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          width: a.width,
          height: a.height,
        })),
      },
    },
    include: {
      attachments: true,
      reactions: { select: { emoji: true, userId: true } },
      replyTo: {
        select: { id: true, authorId: true, text: true, deletedAt: true },
      },
    },
  });

  await prisma.$transaction([
    prisma.messengerConversation.update({
      where: { id: targetId },
      data: { lastMessageAt: now },
    }),
    prisma.messengerMember.update({
      where: { id: dst.membership.id },
      data: { lastReadAt: now },
    }),
  ]);

  const message = serializeMessage(created, {
    currentUserId: user.id,
    isOwner: user.role === "owner",
    nameById: new Map([[user.id, user.fullName]]),
  });

  return NextResponse.json(
    { message, toConversationId: targetId },
    {
      status: 201,
    },
  );
}
