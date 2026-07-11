import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMessengerConversationForUser } from "@/lib/messenger/access";

/**
 * POST /api/v1/manager/messenger/conversations/[id]/read
 *
 * Позначити розмову прочитаною для поточного користувача — зсуває `lastReadAt`
 * учасника на «зараз». Owner-спостерігач (не учасник) — no-op `{ ok: true }`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const access = await getMessengerConversationForUser(user, id);
  if (access.status === 404) {
    return NextResponse.json({ error: "Розмову не знайдено" }, { status: 404 });
  }
  if (access.status === 403) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }
  if (!access.membership) {
    return NextResponse.json({ ok: true });
  }

  await prisma.messengerMember.update({
    where: { id: access.membership.id },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
