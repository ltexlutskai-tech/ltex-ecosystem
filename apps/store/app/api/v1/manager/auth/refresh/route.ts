import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { refreshSchema } from "@/lib/validations/manager-auth";
import { signAccessToken, generateRefreshToken, sha256 } from "@/lib/auth/jwt";
import {
  MANAGER_REFRESH_COOKIE,
  setManagerAuthCookies,
} from "@/lib/auth/manager-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`mgr-refresh:${ip}`, { windowMs: 60_000, max: 30 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Забагато спроб. Спробуйте за хвилину." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = refreshSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
  }

  const plain =
    parsed.data.refreshToken ??
    req.cookies.get(MANAGER_REFRESH_COOKIE)?.value ??
    null;
  if (!plain) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const tokenHash = sha256(plain);
  const existing = await prisma.userRefreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (existing.revokedAt) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (existing.expiresAt <= new Date()) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!existing.user.isActive) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  await prisma.userRefreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  const fresh = generateRefreshToken();
  await prisma.userRefreshToken.create({
    data: {
      userId: existing.userId,
      tokenHash: fresh.hash,
      expiresAt: fresh.expiresAt,
      userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      ipAddress: ip,
    },
  });

  const accessToken = signAccessToken(existing.user.id, existing.user.role);

  const res = NextResponse.json({
    accessToken,
    refreshToken: fresh.plain,
    user: {
      id: existing.user.id,
      email: existing.user.email,
      fullName: existing.user.fullName,
      role: existing.user.role,
      telegramLinked: existing.user.telegramChatId !== null,
    },
  });
  setManagerAuthCookies(res, accessToken, fresh.plain);
  return res;
}
