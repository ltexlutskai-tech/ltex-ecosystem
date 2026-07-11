import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMessengerConversationForUser } from "@/lib/messenger/access";
import type {
  MessengerMessageItem,
  MessengerThreadResponse,
  MessengerUserBrief,
} from "@/lib/messenger/types";

const DELETED_PLACEHOLDER = "Повідомлення видалено";

/**
 * GET /api/v1/manager/messenger/conversations/[id]
 *
 * Тред розмови: шапка (тип, назва, співрозмовник, учасники) + повідомлення
 * (найстаріші зверху). Параметр `before` — курсор пагінації за `createdAt`.
 *
 * Видалені повідомлення показуються як «Повідомлення видалено» усім, крім
 * owner (він бачить оригінальний текст в архіві).
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
  const access = await getMessengerConversationForUser(user, id);
  if (access.status === 404) {
    return NextResponse.json({ error: "Розмову не знайдено" }, { status: 404 });
  }
  if (access.status === 403) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }

  const url = new URL(req.url);
  const beforeRaw = url.searchParams.get("before");
  const before = beforeRaw ? new Date(beforeRaw) : null;
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const limit = Math.min(100, Math.max(1, limitRaw || 50));

  const isOwner = user.role === "owner";

  // Учасники + мапа id→ім'я для authorName.
  const memberUsers = await prisma.user.findMany({
    where: {
      messengerMemberships: { some: { conversationId: id, leftAt: null } },
    },
    select: { id: true, fullName: true, role: true, lastSeenAt: true },
  });
  const nameById = new Map(memberUsers.map((u) => [u.id, u.fullName]));

  const rows = await prisma.messengerMessage.findMany({
    where: {
      conversationId: id,
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const messages: MessengerMessageItem[] = [...rows].reverse().map((r) => {
    const hidden = r.deletedAt !== null && !isOwner;
    return {
      id: r.id,
      conversationId: r.conversationId,
      authorId: r.authorId,
      authorName: r.authorId ? (nameById.get(r.authorId) ?? null) : null,
      kind: r.kind,
      text: hidden ? DELETED_PLACEHOLDER : r.text,
      isMine: r.authorId === user.id,
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  });

  const others = memberUsers.filter((u) => u.id !== user.id);
  const counterpart: MessengerUserBrief | null =
    access.conversation.type === "direct" && others[0]
      ? {
          id: others[0].id,
          fullName: others[0].fullName,
          role: others[0].role,
          lastSeenAt: others[0].lastSeenAt
            ? others[0].lastSeenAt.toISOString()
            : null,
        }
      : null;

  const response: MessengerThreadResponse = {
    conversation: {
      id: access.conversation.id,
      type: access.conversation.type,
      title: access.conversation.title ?? counterpart?.fullName ?? "Розмова",
      counterpart,
      members: memberUsers.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        role: u.role,
        lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
      })),
    },
    messages,
  };

  return NextResponse.json(response);
}
