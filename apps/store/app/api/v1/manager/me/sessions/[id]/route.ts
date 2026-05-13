import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import {
  getCurrentUser,
  MANAGER_ACCESS_COOKIE,
  MANAGER_REFRESH_COOKIE,
} from "@/lib/auth/manager-auth";
import { sha256 } from "@/lib/auth/jwt";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Невірний id" }, { status: 400 });
  }

  const session = await prisma.userRefreshToken.findUnique({
    where: { id },
    select: { id: true, userId: true, revokedAt: true, tokenHash: true },
  });
  if (!session || session.userId !== user.id) {
    return NextResponse.json({ error: "Сесію не знайдено" }, { status: 404 });
  }

  if (!session.revokedAt) {
    await prisma.userRefreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  const currentRefresh = req.cookies.get(MANAGER_REFRESH_COOKIE)?.value ?? null;
  const currentHash = currentRefresh ? sha256(currentRefresh) : null;
  const isCurrent = currentHash !== null && currentHash === session.tokenHash;

  const res = new NextResponse(null, { status: 204 });
  if (isCurrent) {
    res.cookies.set(MANAGER_ACCESS_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
      path: "/",
    });
    res.cookies.set(MANAGER_REFRESH_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
      path: "/api/v1/manager/auth",
    });
  }
  return res;
}
