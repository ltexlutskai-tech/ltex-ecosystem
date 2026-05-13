import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      telegramLinked: user.telegramLinked,
      notifyChannels: user.notifyChannels,
      code1C: user.code1C,
      lastSeenAt: user.lastSeenAt,
    },
  });
}
