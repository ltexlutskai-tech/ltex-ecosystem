import { prisma } from "@ltex/db";
import type { ChatPlatform } from "@ltex/db";
import { matchClientByPhone } from "./phone-match";

export interface IngestInboundArgs {
  platform: ChatPlatform;
  externalUserId: string;
  externalUserName?: string | null;
  text: string;
  phone?: string | null;
  externalMessageId?: string | null;
}

export interface IngestInboundResult {
  conversationId: string;
}

/**
 * Приймає вхідне повідомлення з вебхука платформи й кладе у inbox:
 *
 *   1. Upsert `ChatConversation` за `(platform, externalUserId)`.
 *   2. Якщо розмова ще не прив'язана до клієнта (`clientId === null`) і ми
 *      маємо телефон — звіряємо за `matchClientByPhone`. При матчі ставимо
 *      `clientId` + `agentUserId` (з MgrClient.agentUserId).
 *   3. Створюємо `ChatInboxMessage` (direction `in`, sender `client`).
 *   4. Бампимо `unread_for_manager += 1` + `last_message_at = now`.
 *
 * Викидати з вебхука НЕ повинно — обгортка вебхука сама обробляє throw.
 */
export async function ingestInboundMessage(
  args: IngestInboundArgs,
): Promise<IngestInboundResult> {
  const {
    platform,
    externalUserId,
    externalUserName,
    text,
    phone,
    externalMessageId,
  } = args;

  // 1. Upsert розмови. Update — оновлюємо name/phone (можуть з'явитись пізніше).
  const conversation = await prisma.chatConversation.upsert({
    where: {
      platform_externalUserId: { platform, externalUserId },
    },
    create: {
      platform,
      externalUserId,
      externalUserName: externalUserName ?? null,
      phone: phone ?? null,
      unreadForManager: 0,
      lastMessageAt: new Date(),
    },
    update: {
      externalUserName: externalUserName ?? undefined,
      phone: phone ?? undefined,
    },
    select: {
      id: true,
      clientId: true,
      phone: true,
    },
  });

  // 2. Авто-прив'язка за номером (тільки якщо ще не прив'язано).
  if (!conversation.clientId) {
    const probePhone = phone ?? conversation.phone;
    if (probePhone) {
      const match = await matchClientByPhone(probePhone);
      if (match) {
        await prisma.chatConversation.update({
          where: { id: conversation.id },
          data: {
            clientId: match.clientId,
            agentUserId: match.agentUserId,
            phone: match.phone,
          },
        });
      }
    }
  }

  // 3 + 4. Створюємо повідомлення + бампимо лічильники.
  await prisma.$transaction([
    prisma.chatInboxMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "in",
        sender: "client",
        text,
        externalMessageId: externalMessageId ?? null,
      },
    }),
    prisma.chatConversation.update({
      where: { id: conversation.id },
      data: {
        unreadForManager: { increment: 1 },
        lastMessageAt: new Date(),
      },
    }),
  ]);

  return { conversationId: conversation.id };
}
