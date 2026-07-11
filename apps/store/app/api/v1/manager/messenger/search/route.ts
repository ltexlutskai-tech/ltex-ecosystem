import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { makePreview } from "@/lib/messenger/serialize";
import type { MessengerSearchHit } from "@/lib/messenger/types";

/**
 * GET /api/v1/manager/messenger/search?q=
 *
 * Пошук по тексту повідомлень у всіх моїх розмовах (не видалені, текстові).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ hits: [] });
  }

  const memberships = await prisma.messengerMember.findMany({
    where: { userId: user.id, leftAt: null },
    select: { conversationId: true },
  });
  const convIds = memberships.map((m) => m.conversationId);
  if (convIds.length === 0) {
    return NextResponse.json({ hits: [] });
  }

  const rows = await prisma.messengerMessage.findMany({
    where: {
      conversationId: { in: convIds },
      deletedAt: null,
      kind: "text",
      text: { contains: q, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      conversationId: true,
      text: true,
      createdAt: true,
      author: { select: { fullName: true } },
      conversation: {
        select: {
          type: true,
          title: true,
          members: {
            where: { leftAt: null },
            select: { user: { select: { id: true, fullName: true } } },
          },
        },
      },
    },
  });

  const hits: MessengerSearchHit[] = rows.map((r) => {
    const conv = r.conversation;
    let title = conv.title ?? "Розмова";
    if (conv.type === "direct") {
      const other = conv.members
        .map((m) => m.user)
        .find((u) => u.id !== user.id);
      title = other?.fullName ?? title;
    }
    return {
      id: r.id,
      conversationId: r.conversationId,
      conversationTitle: title,
      authorName: r.author?.fullName ?? null,
      snippet: makePreview(r.text, 140),
      createdAt: r.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ hits });
}
