import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { newsletterSubscribeSchema } from "@/lib/newsletter-schema";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`newsletter:${ip}`, {
    windowMs: 60 * 60 * 1000,
    max: 5,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Забагато запитів. Спробуйте через годину." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невалідний JSON" }, { status: 400 });
  }

  const parsed = newsletterSubscribeSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Помилка валідації";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const source = parsed.data.source ?? "footer";

  try {
    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { email },
    });
    if (existing) {
      // Re-subscribe if previously unsubscribed.
      if (existing.unsubscribedAt) {
        await prisma.newsletterSubscriber.update({
          where: { email },
          data: { unsubscribedAt: null, subscribedAt: new Date() },
        });
      }
      return NextResponse.json({ ok: true, alreadySubscribed: true });
    }

    await prisma.newsletterSubscriber.create({
      data: { email, source },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Помилка збереження. Спробуйте пізніше." },
      { status: 500 },
    );
  }
}
