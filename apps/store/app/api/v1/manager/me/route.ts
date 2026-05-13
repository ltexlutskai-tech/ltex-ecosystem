import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { updateMeSchema } from "@/lib/validations/manager-me";

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateMeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const data: { fullName?: string; notifyChannels?: string[] } = {};
  if (parsed.data.fullName !== undefined) {
    data.fullName = parsed.data.fullName.trim();
  }
  if (parsed.data.notifyChannels !== undefined) {
    data.notifyChannels = parsed.data.notifyChannels;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      notifyChannels: true,
      telegramChatId: true,
    },
  });

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      role: updated.role,
      notifyChannels: updated.notifyChannels,
      telegramLinked: updated.telegramChatId !== null,
    },
  });
}
