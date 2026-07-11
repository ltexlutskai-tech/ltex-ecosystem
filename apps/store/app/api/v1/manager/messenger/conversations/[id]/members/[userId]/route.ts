import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMessengerConversationForUser } from "@/lib/messenger/access";
import { canManageGroup, removeGroupMember } from "@/lib/messenger/group";

/**
 * DELETE /api/v1/manager/messenger/conversations/[id]/members/[userId]
 *
 * Прибрати учасника групи. Себе — може будь-хто (вихід). Іншого — лише адмін
 * групи або глобальний admin/owner.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id, userId } = await params;
  const access = await getMessengerConversationForUser(user, id);
  if (access.status === 404) {
    return NextResponse.json({ error: "Розмову не знайдено" }, { status: 404 });
  }
  if (access.status === 403 || !access.membership) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }
  if (access.conversation.type !== "group") {
    return NextResponse.json(
      { error: "Дія доступна лише для груп" },
      { status: 400 },
    );
  }

  const self = userId === user.id;
  if (!self && !canManageGroup(access.membership.role, user.role)) {
    return NextResponse.json(
      { error: "Лише адміністратор групи може видаляти учасників" },
      { status: 403 },
    );
  }

  await removeGroupMember(
    id,
    { id: user.id, fullName: user.fullName },
    userId,
    self,
  );

  return NextResponse.json({ ok: true });
}
