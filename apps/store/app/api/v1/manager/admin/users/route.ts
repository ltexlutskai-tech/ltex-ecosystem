import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { randomBytes } from "crypto";
import { inviteUserSchema } from "@/lib/validations/manager-auth";
import { requireRole } from "@/lib/auth/manager-auth";
import { hashPassword, generateRandomPassword } from "@/lib/auth/password";
import { sha256 } from "@/lib/auth/jwt";
import { enqueueEmail } from "@/lib/email";
import { buildManagerInviteEmail } from "@/lib/email/templates/manager-invite";
import { getClientIp } from "@/lib/rate-limit";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 днів
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://new.ltex.com.ua";

export async function GET(req: NextRequest) {
  const admin = await requireRole(["admin"], req);
  if (!admin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      code1C: true,
      telegramChatId: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive,
      code1C: u.code1C,
      telegramLinked: u.telegramChatId !== null,
      lastSeenAt: u.lastSeenAt,
      createdAt: u.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireRole(["admin"], req);
  if (!admin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = inviteUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }
  const { email, fullName, role } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Користувач з таким email вже існує" },
      { status: 409 },
    );
  }

  const tempPassword = generateRandomPassword(20);
  const passwordHash = await hashPassword(tempPassword);
  const ip = getClientIp(req);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      fullName,
      role,
      passwordHash,
      isActive: true,
    },
  });

  const plainResetToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(plainResetToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      isInvite: true,
      requestedIp: ip,
    },
  });

  const resetUrl = `${SITE_URL}/manager/reset?token=${plainResetToken}&invite=true`;
  const tmpl = buildManagerInviteEmail({ fullName: user.fullName, resetUrl });
  await enqueueEmail({
    to: user.email,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
    source: "manager-auth",
    referenceId: user.id,
  });

  return NextResponse.json(
    {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      inviteSent: true,
    },
    { status: 201 },
  );
}
