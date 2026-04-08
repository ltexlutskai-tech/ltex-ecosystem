import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { mobileAuthSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/mobile/auth — Register or login by phone.
 * Body: { phone, name?, telegram?, city? }
 * Returns: { customerId, name, phone, isNew }
 *
 * In production, this should verify via SMS OTP.
 * For now, upserts customer by phone number.
 */
export async function POST(request: NextRequest) {
  // Rate limit: 10 auth requests per minute per IP (brute force protection)
  const ip = getClientIp(request);
  const limit = rateLimit(`mobile-auth:${ip}`, { windowMs: 60_000, max: 10 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Забагато спроб. Зачекайте хвилину." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = mobileAuthSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }

  const { phone, name, telegram, city } = parsed.data;

  try {
    let customer = await prisma.customer.findFirst({ where: { phone } });
    const isNew = !customer;

    if (!customer) {
      if (!name) {
        return NextResponse.json(
          { error: "Ім'я обов'язкове для реєстрації" },
          { status: 400 },
        );
      }
      customer = await prisma.customer.create({
        data: { name, phone, telegram, city },
      });
    } else if (name || telegram || city) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          ...(name && { name }),
          ...(telegram && { telegram }),
          ...(city && { city }),
        },
      });
    }

    return NextResponse.json({
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      telegram: customer.telegram,
      city: customer.city,
      isNew,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
