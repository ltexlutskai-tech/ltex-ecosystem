import { prisma } from "@ltex/db";
import type { CurrentManager } from "@/lib/auth/manager-auth";

export interface ConversationAccess {
  conversationId: string;
  platform: "telegram" | "viber" | "whatsapp" | "instagram";
  externalUserId: string;
  agentUserId: string | null;
  clientId: string | null;
}

/**
 * Перевіряє чи поточний користувач має доступ до розмови.
 *
 * - admin → завжди дозволено.
 * - manager → дозволено коли `agentUserId === user.id` АБО `agentUserId IS NULL`
 *   (нерозподілена розмова в спільному пулі).
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
    },
  });
  if (!c) return { status: 404 };
  if (user.role !== "admin") {
    const allowed = c.agentUserId === user.id || c.agentUserId === null;
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
