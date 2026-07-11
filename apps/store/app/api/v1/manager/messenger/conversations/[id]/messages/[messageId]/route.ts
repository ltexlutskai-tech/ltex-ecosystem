import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMessengerConversationForUser } from "@/lib/messenger/access";
import { serializeMessage } from "@/lib/messenger/serialize";

const editSchema = z.object({
  text: z.string().trim().min(1, "Текст не може бути порожнім").max(4000),
});

/**
 * PATCH /api/v1/manager/messenger/conversations/[id]/messages/[messageId]
 *
 * Редагувати власне текстове повідомлення. Ставить `editedAt`. Тільки автор,
 * тільки текстове, не видалене.
 */
export async function PATCH(
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
    select: { authorId: true, kind: true, deletedAt: true },
  });
  if (!msg) {
    return NextResponse.json(
      { error: "Повідомлення не знайдено" },
      { status: 404 },
    );
  }
  if (msg.authorId !== user.id) {
    return NextResponse.json(
      { error: "Можна редагувати лише власні повідомлення" },
      { status: 403 },
    );
  }
  if (msg.kind !== "text" || msg.deletedAt) {
    return NextResponse.json(
      { error: "Це повідомлення не можна редагувати" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const updated = await prisma.messengerMessage.update({
    where: { id: messageId },
    data: { text: parsed.data.text, editedAt: new Date() },
    include: {
      attachments: true,
      replyTo: {
        select: { id: true, authorId: true, text: true, deletedAt: true },
      },
    },
  });

  const nameById = new Map<string, string>([[user.id, user.fullName]]);
  const replyAuthorId = updated.replyTo?.authorId;
  if (replyAuthorId && !nameById.has(replyAuthorId)) {
    const a = await prisma.user.findUnique({
      where: { id: replyAuthorId },
      select: { fullName: true },
    });
    if (a) nameById.set(replyAuthorId, a.fullName);
  }

  const message = serializeMessage(updated, {
    currentUserId: user.id,
    isOwner: user.role === "owner",
    nameById,
  });

  return NextResponse.json({ message });
}

/**
 * DELETE /api/v1/manager/messenger/conversations/[id]/messages/[messageId]
 *
 * М'яке видалення (deletedAt=now). Видаляти може автор, owner (нагляд) або
 * адмін групи. Owner далі бачить оригінал в архіві.
 */
export async function DELETE(
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
    select: { authorId: true, kind: true, deletedAt: true },
  });
  if (!msg) {
    return NextResponse.json(
      { error: "Повідомлення не знайдено" },
      { status: 404 },
    );
  }
  if (msg.kind === "system") {
    return NextResponse.json(
      { error: "Службові повідомлення не видаляються" },
      { status: 400 },
    );
  }

  const isAuthor = msg.authorId === user.id;
  const isGroupAdmin =
    access.conversation.type === "group" && access.membership.role === "admin";
  const canDelete = isAuthor || user.role === "owner" || isGroupAdmin;
  if (!canDelete) {
    return NextResponse.json(
      { error: "Немає прав видалити це повідомлення" },
      { status: 403 },
    );
  }

  if (!msg.deletedAt) {
    await prisma.messengerMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
