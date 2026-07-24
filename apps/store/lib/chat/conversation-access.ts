import { Prisma, prisma } from "@ltex/db";
import type { ChatPlatform } from "@ltex/db";
import type { CurrentManager } from "@/lib/auth/manager-auth";
import { canView } from "@/lib/permissions/role-permissions";

export interface ConversationAccess {
  conversationId: string;
  platform: ChatPlatform;
  externalUserId: string;
  agentUserId: string | null;
  clientId: string | null;
}

/**
 * ЄДИНЕ джерело chat-scope для розмов (ТЗ 2026-07-17). Використовується скрізь,
 * де показуємо/рахуємо розмови (inbox-список, лічильник unread, вкладка
 * «Повідомлення» картки, індикатор списку клієнтів), щоб показане завжди
 * збігалося з тим, що менеджер реально може відкрити (`getConversationForUser`):
 *   • повний доступ (chat view:all — admin/owner/supervisor) → усі розмови;
 *   • менеджер (chat view:mine) → лише призначені йому (`agentUserId`) АБО зі
 *     своїм клієнтом (`client.agentUserId`).
 *
 * Повертає порожній `{}` для повного доступу (додається до інших умов через
 * spread) або `{ OR: [...] }` для обмеженого.
 */
export function buildChatScopeWhere(
  user: Pick<CurrentManager, "id" | "role">,
): Prisma.ChatConversationWhereInput {
  const scope = canView({ role: user.role }, "chat").scope;
  return scope === "all"
    ? {}
    : {
        OR: [{ agentUserId: user.id }, { client: { agentUserId: user.id } }],
      };
}

/**
 * Перевіряє чи поточний користувач має доступ до розмови (ТЗ 2026-07-17).
 *
 * - повний доступ (chat view:all — admin/owner/supervisor) → завжди дозволено;
 * - менеджер (chat view:mine) → дозволено коли розмова призначена йому
 *   (`agentUserId === user.id`) АБО клієнт розмови — його
 *   (`client.agentUserId === user.id`). Нічийний / чужий пул — заборонено.
 *
 * Повертає:
 * - `{ status: 404 }` коли розмови нема;
 * - `{ status: 403 }` коли доступ заборонений;
 * - `{ status: 200, conversation }` коли все ок.
 */
export type ConversationAccessResult =
  | { status: 200; conversation: ConversationAccess }
  | { status: 404 }
  | { status: 403 };

export async function getConversationForUser(
  user: Pick<CurrentManager, "id" | "role">,
  conversationId: string,
): Promise<ConversationAccessResult> {
  const c = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      platform: true,
      externalUserId: true,
      agentUserId: true,
      clientId: true,
      client: { select: { agentUserId: true } },
    },
  });
  if (!c) return { status: 404 };
  const chatScope = canView({ role: user.role }, "chat").scope;
  if (chatScope !== "all") {
    const allowed =
      c.agentUserId === user.id || c.client?.agentUserId === user.id;
    if (!allowed) return { status: 403 };
  }
  return {
    status: 200,
    conversation: {
      conversationId: c.id,
      platform: c.platform,
      externalUserId: c.externalUserId,
      agentUserId: c.agentUserId,
      clientId: c.clientId,
    },
  };
}
