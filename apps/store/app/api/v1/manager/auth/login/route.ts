import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { loginSchema } from "@/lib/validations/manager-auth";
import { verifyPassword } from "@/lib/auth/password";
import {
  signAccessToken,
  generateRefreshToken,
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
} from "@/lib/auth/jwt";
import {
  isLocked,
  recordFailedLogin,
  clearFailedLogins,
} from "@/lib/auth/lockout";
import {
  MANAGER_ACCESS_COOKIE,
  MANAGER_REFRESH_COOKIE,
} from "@/lib/auth/manager-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`mgr-login:${ip}`, { windowMs: 60_000, max: 10 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Забагато спроб. Спробуйте за хвилину." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 3) },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  // Anti-enumeration — same response for "no user" + "wrong password"
  if (!user) {
    return NextResponse.json(
      { error: "Невірний email або пароль" },
      { status: 401 },
    );
  }

  if (!user.isActive) {
    return NextResponse.json(
      { error: "Обліковий запис вимкнено" },
      { status: 403 },
    );
  }

  if (await isLocked(user.id)) {
    return NextResponse.json(
      {
        error:
          "Обліковий запис тимчасово заблоковано. Спробуйте через 15 хвилин.",
      },
      { status: 423 },
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await recordFailedLogin(user.id);
    return NextResponse.json(
      { error: "Невірний email або пароль" },
      { status: 401 },
    );
  }

  await clearFailedLogins(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date(), lastLoginIp: ip },
  });

  const accessToken = signAccessToken(user.id, user.role);
  const refresh = generateRefreshToken();
  await prisma.userRefreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      ipAddress: ip,
    },
  });

  const res = NextResponse.json({
    accessToken,
    refreshToken: refresh.plain,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      telegramLinked: user.telegramChatId !== null,
    },
  });
  res.cookies.set(MANAGER_ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ACCESS_TOKEN_TTL_SEC,
    path: "/",
  });
  res.cookies.set(MANAGER_REFRESH_COOKIE, refresh.plain, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: REFRESH_TOKEN_TTL_SEC,
    path: "/api/v1/manager/auth",
  });
  return res;
}
