import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { randomBytes } from "crypto";
import { passwordResetRequestSchema } from "@/lib/validations/manager-auth";
import { sha256 } from "@/lib/auth/jwt";
import { enqueueEmail } from "@/lib/email";
import { buildManagerPasswordResetEmail } from "@/lib/email/templates/manager-password-reset";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 година
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://new.ltex.com.ua";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipLimit = rateLimit(`mgr-reset-req-ip:${ip}`, {
    windowMs: 60 * 60 * 1000,
    max: 20,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Забагато спроб. Спробуйте пізніше." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = passwordResetRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();

  const emailLimit = rateLimit(`mgr-reset-req-email:${email}`, {
    windowMs: 60 * 60 * 1000,
    max: 3,
  });
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { error: "Забагато спроб. Спробуйте пізніше." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Anti-enumeration: always 202.
  if (user && user.isActive) {
    const plain = randomBytes(32).toString("base64url");
    const tokenHash = sha256(plain);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        isInvite: false,
        requestedIp: ip,
      },
    });
    const resetUrl = `${SITE_URL}/manager/reset?token=${plain}`;
    const tmpl = buildManagerPasswordResetEmail({
      fullName: user.fullName,
      resetUrl,
    });
    await enqueueEmail({
      to: user.email,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      source: "manager-auth",
      referenceId: user.id,
    });
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
