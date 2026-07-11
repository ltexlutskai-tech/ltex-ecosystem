import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMessengerConversationForUser } from "@/lib/messenger/access";
import { serializeMessage } from "@/lib/messenger/serialize";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const messageBodySchema = z.object({
  text: z.string().trim().min(1, "Текст не може бути порожнім").max(4000),
  replyToId: z.string().min(1).optional(),
});

/**
 * POST /api/v1/manager/messenger/conversations/[id]/messages
 *
 * Надіслати текстове повідомлення у розмову. Дозволено лише активним учасникам
 * (owner-спостерігач писати не може). Оновлює `lastMessageAt` розмови й
 * позначає повідомлення прочитаним для автора (bump lastReadAt).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const ip = getClientIp(req);
  if (!rateLimit(`msgr-send:${user.id}:${ip}`, { windowMs: 60_000, max: 60 })) {
    return NextResponse.json(
      { error: "Забагато повідомлень. Зачекайте трохи." },
      { status: 429 },
    );
  }

  const { id } = await params;
  const access = await getMessengerConversationForUser(user, id);
  if (access.status === 404) {
    return NextResponse.json({ error: "Розмову не знайдено" }, { status: 404 });
  }
  if (access.status === 403) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }
  if (!access.membership) {
    return NextResponse.json(
      { error: "Ви не є учасником цієї розмови" },
      { status: 403 },
    );
  }

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

  // Перевірка цитати: батьківське повідомлення має бути з цієї ж розмови.
  let replyToId: string | null = null;
  if (parsed.data.replyToId) {
    const parent = await prisma.messengerMessage.findFirst({
      where: { id: parsed.data.replyToId, conversationId: id },
      select: { id: true },
    });
    if (!parent) {
      return NextResponse.json(
        { error: "Повідомлення для відповіді не знайдено" },
        { status: 400 },
      );
    }
    replyToId = parent.id;
  }

  const now = new Date();
  const created = await prisma.messengerMessage.create({
    data: {
      conversationId: id,
      authorId: user.id,
      kind: "text",
      text: parsed.data.text,
      replyToId,
    },
    include: {
      attachments: true,
      replyTo: {
        select: { id: true, authorId: true, text: true, deletedAt: true },
      },
    },
  });

  await prisma.$transaction([
    prisma.messengerConversation.update({
      where: { id },
      data: { lastMessageAt: now },
    }),
    // Автор бачить власне повідомлення як прочитане.
    prisma.messengerMember.update({
      where: { id: access.membership.id },
      data: { lastReadAt: now },
    }),
  ]);

  // Імена для цитати: автор (я) + автор батьківського повідомлення.
  const nameById = new Map<string, string>([[user.id, user.fullName]]);
  const replyAuthorId = created.replyTo?.authorId;
  if (replyAuthorId && !nameById.has(replyAuthorId)) {
    const a = await prisma.user.findUnique({
      where: { id: replyAuthorId },
      select: { fullName: true },
    });
    if (a) nameById.set(replyAuthorId, a.fullName);
  }

  const message = serializeMessage(created, {
    currentUserId: user.id,
    isOwner: user.role === "owner",
    nameById,
  });

  return NextResponse.json({ message }, { status: 201 });
}
