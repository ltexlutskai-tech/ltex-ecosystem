import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { buildChatScopeWhere } from "@/lib/chat/conversation-access";

/**
 * GET /api/v1/manager/chat/conversations
 *
 * Список розмов inbox-у (ТЗ 2026-07-17 — «чат тільки зі своїми клієнтами»).
 * - повний доступ (admin/owner/supervisor, chat view:all) → усі розмови;
 * - менеджер (chat view:mine) → лише розмови, ПРИЗНАЧЕНІ йому
 *   (`agentUserId = user.id`) АБО де клієнт розмови — його
 *   (`client.agentUserId = user.id`). Нічийний / чужий пул більше НЕ видно;
 *   нові невідомі номери авто-призначаються менеджеру за областю (inbound).
 *
 * Сортування: `lastMessageAt desc`.
 * Параметри: `page` (1+), `pageSize` (1..100, default 20).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? 20);
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw || 20));

  const where = buildChatScopeWhere(user);

  const [items, total] = await Promise.all([
    prisma.chatConversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        client: { select: { id: true, name: true } },
      },
    }),
    prisma.chatConversation.count({ where }),
  ]);

  return NextResponse.json({
    conversations: items.map((c) => ({
      id: c.id,
      platform: c.platform,
      externalUserId: c.externalUserId,
      externalUserName: c.externalUserName,
      phone: c.phone,
      clientId: c.clientId,
      agentUserId: c.agentUserId,
      status: c.status,
      unreadForManager: c.unreadForManager,
      lastMessageAt: c.lastMessageAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
      client: c.client,
    })),
    total,
    page,
    pageSize,
  });
}
