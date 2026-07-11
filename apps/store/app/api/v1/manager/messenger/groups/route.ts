import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { createGroup } from "@/lib/messenger/group";

const createGroupSchema = z.object({
  title: z.string().trim().min(1, "Вкажіть назву групи").max(100),
  memberIds: z.array(z.string().min(1)).max(200).default([]),
});

/**
 * POST /api/v1/manager/messenger/groups
 *
 * Створити груповий чат. Тіло: `{ title, memberIds }`. Творець стає адміном
 * групи. Повертає `{ conversationId }`.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const conversationId = await createGroup(
    { id: user.id, fullName: user.fullName },
    parsed.data.title,
    parsed.data.memberIds,
  );

  return NextResponse.json({ conversationId }, { status: 201 });
}
