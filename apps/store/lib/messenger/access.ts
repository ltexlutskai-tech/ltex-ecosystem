import { prisma } from "@ltex/db";

/**
 * Доступ до розмови внутрішнього месенджера.
 *
 * - Учасник розмови (member без `leftAt`) → повний доступ.
 * - `owner` → може ПЕРЕГЛЯДАТИ будь-яку розмову (нагляд), навіть не будучи
 *   учасником; писати може лише як учасник.
 *
 * Повертає:
 * - `{ status: 404 }` — розмови нема;
 * - `{ status: 403 }` — не учасник і не owner;
 * - `{ status: 200, ... }` — доступ дозволено.
 */
export interface MessengerMemberInfo {
  id: string;
  userId: string;
  role: "member" | "admin";
  lastReadAt: Date | null;
}

export interface MessengerConversationInfo {
  id: string;
  type: "direct" | "group";
  title: string | null;
  members: MessengerMemberInfo[];
}

export type MessengerAccessResult =
  | {
      status: 200;
      conversation: MessengerConversationInfo;
      /** Членство поточного користувача. `null` для owner-спостерігача. */
      membership: MessengerMemberInfo | null;
    }
  | { status: 404 }
  | { status: 403 };

export async function getMessengerConversationForUser(
  user: { id: string; role: string },
  conversationId: string,
): Promise<MessengerAccessResult> {
  const conv = await prisma.messengerConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      type: true,
      title: true,
      members: {
        where: { leftAt: null },
        select: { id: true, userId: true, role: true, lastReadAt: true },
      },
    },
  });
  if (!conv) return { status: 404 };

  const membership = conv.members.find((m) => m.userId === user.id) ?? null;
  const isOwner = user.role === "owner";
  if (!membership && !isOwner) return { status: 403 };

  return {
    status: 200,
    conversation: {
      id: conv.id,
      type: conv.type,
      title: conv.title,
      members: conv.members,
    },
    membership,
  };
}

/**
 * Кількість непрочитаних повідомлень у розмові для конкретного учасника:
 * повідомлення інших авторів після мітки `lastReadAt`, не видалені.
 */
export async function countUnread(
  conversationId: string,
  userId: string,
  lastReadAt: Date | null,
): Promise<number> {
  return prisma.messengerMessage.count({
    where: {
      conversationId,
      authorId: { not: userId },
      deletedAt: null,
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  });
}
