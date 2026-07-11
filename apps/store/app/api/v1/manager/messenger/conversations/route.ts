import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { countUnread } from "@/lib/messenger/access";
import { getOrCreateDirectConversation } from "@/lib/messenger/direct";
import type {
  MessengerConversationListItem,
  MessengerUserBrief,
} from "@/lib/messenger/types";

/**
 * GET /api/v1/manager/messenger/conversations
 *
 * Список моїх розмов (де я активний учасник), відсортований за останнім
 * повідомленням. Для кожної рахуємо непрочитані.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const memberships = await prisma.messengerMember.findMany({
    where: { userId: user.id, leftAt: null },
    select: {
      lastReadAt: true,
      conversation: {
        select: {
          id: true,
          type: true,
          title: true,
          lastMessageAt: true,
          members: {
            where: { leftAt: null },
            select: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  role: true,
                  lastSeenAt: true,
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              text: true,
              deletedAt: true,
              kind: true,
              attachments: { select: { kind: true }, take: 2 },
            },
          },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: "desc" } },
  });

  const items: MessengerConversationListItem[] = await Promise.all(
    memberships.map(async (m) => {
      const conv = m.conversation;
      const others = conv.members
        .map((cm) => cm.user)
        .filter((u) => u.id !== user.id);
      const counterpart: MessengerUserBrief | null =
        conv.type === "direct" && others[0]
          ? {
              id: others[0].id,
              fullName: others[0].fullName,
              role: others[0].role,
              lastSeenAt: others[0].lastSeenAt
                ? others[0].lastSeenAt.toISOString()
                : null,
            }
          : null;

      const last = conv.messages[0];
      let preview: string | null = null;
      if (last) {
        if (last.deletedAt) {
          preview = "Повідомлення видалено";
        } else if (last.text) {
          preview = last.text;
        } else if (last.attachments.length > 0) {
          preview = last.attachments.some((a) => a.kind === "image")
            ? "📷 Фото"
            : "📎 Файл";
        }
      }

      const unread = await countUnread(conv.id, user.id, m.lastReadAt);

      return {
        id: conv.id,
        type: conv.type,
        title: conv.title ?? counterpart?.fullName ?? "Розмова",
        counterpart,
        lastMessagePreview: preview,
        lastMessageAt: conv.lastMessageAt.toISOString(),
        unread,
      };
    }),
  );

  return NextResponse.json({ conversations: items });
}

const openBodySchema = z.object({
  userId: z.string().min(1, "Не вказано користувача"),
});

/**
 * POST /api/v1/manager/messenger/conversations
 *
 * Відкрити (або створити) особистий чат зі співробітником.
 * Тіло: `{ userId }`. Повертає `{ conversationId }`.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = openBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  try {
    const conversationId = await getOrCreateDirectConversation(
      user.id,
      parsed.data.userId,
    );
    return NextResponse.json({ conversationId }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message === "self") {
      return NextResponse.json(
        { error: "Не можна почати чат із самим собою" },
        { status: 400 },
      );
    }
    if (err instanceof Error && err.message === "not_found") {
      return NextResponse.json(
        { error: "Співробітника не знайдено" },
        { status: 404 },
      );
    }
    throw err;
  }
}
