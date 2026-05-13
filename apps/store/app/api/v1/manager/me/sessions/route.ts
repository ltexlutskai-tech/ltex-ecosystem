import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import {
  getCurrentUser,
  MANAGER_REFRESH_COOKIE,
} from "@/lib/auth/manager-auth";
import { sha256 } from "@/lib/auth/jwt";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const sessions = await prisma.userRefreshToken.findMany({
    where: {
      userId: user.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      expiresAt: true,
      tokenHash: true,
    },
  });

  const currentRefresh = req.cookies.get(MANAGER_REFRESH_COOKIE)?.value ?? null;
  const currentHash = currentRefresh ? sha256(currentRefresh) : null;

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: currentHash !== null && s.tokenHash === currentHash,
    })),
  });
}
