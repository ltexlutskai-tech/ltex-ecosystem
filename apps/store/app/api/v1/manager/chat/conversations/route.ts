import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/chat/conversations
 *
 * Список розмов inbox-у.
 * - admin → бачить усі.
 * - manager → бачить ті, де `agentUserId = user.id` АБО `agentUserId IS NULL`
 *   (нерозприділені = спільний пул, доступний усім менеджерам).
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

  const where: Prisma.ChatConversationWhereInput =
    user.role === "admin"
      ? {}
      : { OR: [{ agentUserId: user.id }, { agentUserId: null }] };

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
