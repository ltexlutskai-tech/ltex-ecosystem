import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { changePasswordSchema } from "@/lib/validations/manager-me";

export async function POST(req: NextRequest) {
  const current = await getCurrentUser(req);
  if (!current) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: current.id },
    select: { id: true, passwordHash: true },
  });
  if (!dbUser) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const ok = await verifyPassword(
    parsed.data.currentPassword,
    dbUser.passwordHash,
  );
  if (!ok) {
    return NextResponse.json(
      { error: "Поточний пароль невірний" },
      { status: 401 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: dbUser.id },
      data: { passwordHash },
    }),
    prisma.userRefreshToken.updateMany({
      where: { userId: dbUser.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return new NextResponse(null, { status: 204 });
}
