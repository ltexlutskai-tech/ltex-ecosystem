import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { randomBytes } from "crypto";
import { updateUserSchema } from "@/lib/validations/manager-auth";
import { requireRole } from "@/lib/auth/manager-auth";
import { sha256 } from "@/lib/auth/jwt";
import { enqueueEmail } from "@/lib/email";
import { buildManagerPasswordResetEmail } from "@/lib/email/templates/manager-password-reset";
import { getClientIp } from "@/lib/rate-limit";

const RESET_TTL_MS = 60 * 60 * 1000;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://new.ltex.com.ua";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await requireRole(["admin"], req);
  if (!admin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json(
      { error: "Користувача не знайдено" },
      { status: 404 },
    );
  }

  const { isActive, role, fullName, forcePasswordReset } = parsed.data;

  // Prevent the last admin from being demoted/deactivated by mistake.
  if (
    target.role === "admin" &&
    target.isActive &&
    (isActive === false || (role !== undefined && role !== "admin"))
  ) {
    const otherActiveAdmins = await prisma.user.count({
      where: {
        id: { not: target.id },
        role: "admin",
        isActive: true,
      },
    });
    if (otherActiveAdmins === 0) {
      return NextResponse.json(
        {
          error: "Не можна вимкнути або змінити роль останнього адміністратора",
        },
        { status: 409 },
      );
    }
  }

  const data: {
    isActive?: boolean;
    role?:
      | "manager"
      | "senior_manager"
      | "admin"
      | "owner"
      | "supervisor"
      | "analyst"
      | "warehouse"
      | "expeditor"
      | "bookkeeper";
    fullName?: string;
  } = {};
  if (isActive !== undefined) data.isActive = isActive;
  if (role !== undefined) data.role = role;
  if (fullName !== undefined) data.fullName = fullName;

  if (Object.keys(data).length > 0) {
    await prisma.user.update({ where: { id }, data });
  }

  // Deactivating a user also revokes all their refresh tokens.
  if (isActive === false) {
    await prisma.userRefreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  if (forcePasswordReset) {
    await prisma.userRefreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const plain = randomBytes(32).toString("base64url");
    const tokenHash = sha256(plain);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    await prisma.passwordResetToken.create({
      data: {
        userId: id,
        tokenHash,
        expiresAt,
        isInvite: false,
        requestedIp: getClientIp(req),
      },
    });
    const resetUrl = `${SITE_URL}/manager/reset?token=${plain}`;
    const tmpl = buildManagerPasswordResetEmail({
      fullName: target.fullName,
      resetUrl,
    });
    await enqueueEmail({
      to: target.email,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      source: "manager-auth",
      referenceId: target.id,
    });
  }

  const updated = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      code1C: true,
      telegramChatId: true,
      lastSeenAt: true,
    },
  });
  if (!updated) {
    return NextResponse.json(
      { error: "Користувача не знайдено" },
      { status: 404 },
    );
  }
  return NextResponse.json({
    user: {
      ...updated,
      telegramLinked: updated.telegramChatId !== null,
    },
    forcedPasswordReset: forcePasswordReset === true,
  });
}
