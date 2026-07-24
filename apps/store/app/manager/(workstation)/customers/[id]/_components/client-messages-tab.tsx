import { prisma } from "@ltex/db";
import type { CurrentManager } from "@/lib/auth/manager-auth";
import { buildChatScopeWhere } from "@/lib/chat/conversation-access";
import {
  ClientConversationsPanel,
  type ClientConversationSummary,
} from "./client-conversations-panel";

/**
 * Вкладка «Повідомлення» — переписка з ЦИМ клієнтом (усі його розмови в
 * об'єднаному месенджері). Рендериться лише для «своїх» клієнтів (для чужого
 * вкладка приховується у `ClientTabs`, а контакти й так масковані M1.3f).
 *
 * Розмови беруться за `clientId` + ТОЙ САМИЙ chat-scope, що й inbox/тред
 * (`getConversationForUser`), щоб показані summaries точно збігалися з тими,
 * які менеджер зможе відкрити (менеджер — лише свої: `agentUserId` розмови АБО
 * клієнта; повний доступ — усе). Прив'язка до клієнта — за телефоном на вході.
 */
export async function ClientMessagesTab({
  clientId,
  user,
}: {
  clientId: string;
  user: Pick<CurrentManager, "id" | "role">;
}) {
  const conversations = await prisma.chatConversation.findMany({
    where: { clientId, ...buildChatScopeWhere(user) },
    orderBy: { lastMessageAt: "desc" },
    take: 20,
    select: {
      id: true,
      platform: true,
      externalUserName: true,
      phone: true,
      unreadForManager: true,
      lastMessageAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { text: true },
      },
    },
  });

  const summaries: ClientConversationSummary[] = conversations.map((c) => ({
    id: c.id,
    platform: c.platform,
    externalUserName: c.externalUserName,
    phone: c.phone,
    unreadForManager: c.unreadForManager,
    lastMessageAt: c.lastMessageAt.toISOString(),
    lastMessagePreview: c.messages[0]?.text ?? null,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">Повідомлення</h3>
        {summaries.length > 0 && (
          <a
            href="/manager/chat"
            className="text-xs text-blue-600 hover:underline"
          >
            Відкрити весь месенджер →
          </a>
        )}
      </div>
      <ClientConversationsPanel conversations={summaries} />
    </div>
  );
}
