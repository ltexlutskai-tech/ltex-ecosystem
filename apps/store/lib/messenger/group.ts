import { prisma } from "@ltex/db";

/**
 * Логіка групових чатів внутрішнього месенджера (Етап 2).
 *
 * Права:
 * - створити групу може будь-хто (рішення user);
 * - додати учасників — будь-який активний учасник;
 * - видалити іншого / перейменувати — адмін групи АБО глобальний admin/owner;
 * - вийти — будь-який учасник.
 *
 * Кожна зміна складу/назви пише службове повідомлення (`kind = system`).
 */

export function canManageGroup(
  membershipRole: "member" | "admin" | null,
  userRole: string,
): boolean {
  return (
    membershipRole === "admin" || userRole === "admin" || userRole === "owner"
  );
}

/** Створює групу; творець стає адміном. Повертає id розмови. */
export async function createGroup(
  creator: { id: string; fullName: string },
  title: string,
  memberIds: string[],
): Promise<string> {
  const trimmed = title.trim();
  const uniqueIds = [...new Set(memberIds)].filter((id) => id !== creator.id);

  const validUsers = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, isActive: true },
    select: { id: true },
  });
  const validIds = validUsers.map((u) => u.id);

  const conv = await prisma.messengerConversation.create({
    data: {
      type: "group",
      title: trimmed,
      createdById: creator.id,
      members: {
        create: [
          { userId: creator.id, role: "admin" },
          ...validIds.map((id) => ({ userId: id, role: "member" as const })),
        ],
      },
      messages: {
        create: [
          {
            kind: "system",
            text: `${creator.fullName} створив(ла) групу «${trimmed}»`,
          },
        ],
      },
    },
    select: { id: true },
  });
  return conv.id;
}

/** Додає учасників (нових створює, тих хто виходив — повертає). */
export async function addGroupMembers(
  conversationId: string,
  actor: { id: string; fullName: string },
  userIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(userIds)];
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, isActive: true },
    select: { id: true, fullName: true },
  });
  if (users.length === 0) return;

  const now = new Date();
  await prisma.$transaction([
    ...users.map((u) =>
      prisma.messengerMember.upsert({
        where: {
          conversationId_userId: { conversationId, userId: u.id },
        },
        create: { conversationId, userId: u.id, role: "member" },
        update: { leftAt: null },
      }),
    ),
    prisma.messengerMessage.create({
      data: {
        conversationId,
        kind: "system",
        text: `${actor.fullName} додав(ла): ${users.map((u) => u.fullName).join(", ")}`,
      },
    }),
    prisma.messengerConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now },
    }),
  ]);
}

/** Прибирає учасника (leftAt = now). `self` — коли користувач виходить сам. */
export async function removeGroupMember(
  conversationId: string,
  actor: { id: string; fullName: string },
  targetUserId: string,
  self: boolean,
): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { fullName: true },
  });
  const targetName = target?.fullName ?? "учасник";
  const now = new Date();

  const text = self
    ? `${actor.fullName} вийшов(ла) з групи`
    : `${actor.fullName} видалив(ла): ${targetName}`;

  await prisma.$transaction([
    prisma.messengerMember.updateMany({
      where: { conversationId, userId: targetUserId, leftAt: null },
      data: { leftAt: now },
    }),
    prisma.messengerMessage.create({
      data: { conversationId, kind: "system", text },
    }),
    prisma.messengerConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now },
    }),
  ]);
}

/** Перейменовує групу. */
export async function renameGroup(
  conversationId: string,
  actor: { id: string; fullName: string },
  title: string,
): Promise<void> {
  const trimmed = title.trim();
  const now = new Date();
  await prisma.$transaction([
    prisma.messengerConversation.update({
      where: { id: conversationId },
      data: { title: trimmed, lastMessageAt: now },
    }),
    prisma.messengerMessage.create({
      data: {
        conversationId,
        kind: "system",
        text: `${actor.fullName} перейменував(ла) групу на «${trimmed}»`,
      },
    }),
  ]);
}
