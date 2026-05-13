import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { passwordResetConfirmSchema } from "@/lib/validations/manager-auth";
import { sha256 } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`mgr-reset-confirm:${ip}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Забагато спроб. Спробуйте за хвилину." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = passwordResetConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }

  const { token, newPassword } = parsed.data;
  const tokenHash = sha256(token);
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });
  if (!row) {
    return NextResponse.json(
      { error: "Посилання недійсне або застаріло." },
      { status: 401 },
    );
  }
  if (row.usedAt) {
    return NextResponse.json(
      { error: "Посилання вже використано." },
      { status: 401 },
    );
  }
  if (row.expiresAt <= new Date()) {
    return NextResponse.json(
      { error: "Термін дії посилання вичерпано." },
      { status: 401 },
    );
  }

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    prisma.userRefreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: now },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
