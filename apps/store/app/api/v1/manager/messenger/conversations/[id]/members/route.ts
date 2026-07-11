import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMessengerConversationForUser } from "@/lib/messenger/access";
import { addGroupMembers } from "@/lib/messenger/group";

const addMembersSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, "Не вибрано жодного").max(200),
});

/**
 * POST /api/v1/manager/messenger/conversations/[id]/members
 *
 * Додати учасників до групи. Дозволено будь-якому активному учаснику групи.
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
  if (access.status === 403 || !access.membership) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }
  if (access.conversation.type !== "group") {
    return NextResponse.json(
      { error: "Додавати учасників можна лише в групу" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = addMembersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  await addGroupMembers(
    id,
    { id: user.id, fullName: user.fullName },
    parsed.data.userIds,
  );

  return NextResponse.json({ ok: true });
}
