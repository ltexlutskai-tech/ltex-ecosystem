import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { setCustomerCookie } from "@/lib/customer-auth";
import { notifyNewLead } from "@/lib/notifications";
import { createSiteLead } from "@/lib/manager/site-lead";

const schema = z.object({
  phone: z.string().min(8).max(32),
  name: z.string().min(1).max(100),
  city: z.string().max(100).optional().nullable(),
});

function normalizePhone(raw: string): string {
  const stripped = raw.replace(/\s+/g, "").replace(/[^\d+]/g, "");
  if (stripped.startsWith("+")) return stripped;
  if (stripped.startsWith("380")) return `+${stripped}`;
  if (stripped.startsWith("0") && stripped.length >= 9) {
    return `+38${stripped}`;
  }
  return `+${stripped}`;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`customer-login:${ip}`, {
    windowMs: 60_000,
    max: 5,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Забагато спроб. Зачекайте хвилину." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        issues: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  const phone = normalizePhone(parsed.data.phone);
  const name = parsed.data.name.trim();
  const city =
    parsed.data.city === undefined || parsed.data.city === null
      ? null
      : parsed.data.city.trim() || null;

  try {
    let wasCreated = false;
    let customer = await prisma.customer.findFirst({
      where: { phone },
      select: { id: true, name: true, city: true },
    });
    if (!customer) {
      customer = await prisma.customer.create({
        data: { phone, name, city },
        select: { id: true, name: true, city: true },
      });
      wasCreated = true;
    } else {
      // For existing customers: never overwrite name/city the user set in
      // /account. Only fill empty/null fields from the login payload.
      const updates: { name?: string; city?: string | null } = {};
      if (!customer.name?.trim() && name) {
        updates.name = name;
      }
      if (customer.city == null && city) {
        updates.city = city;
      }
      if (Object.keys(updates).length > 0) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: updates,
        });
      }
    }

    await setCustomerCookie(customer.id);

    if (wasCreated) {
      notifyNewLead({
        customerId: customer.id,
        phone,
        name,
        city,
        source: "web",
      }).catch(() => {});
      // CRM-лід (не повноцінний клієнт) — окрема вкладка в «Клієнтах».
      createSiteLead({ name, phone, city }).catch(() => {});
    }

    // NOTE: Guest cart merge intentionally NOT supported here. The cart
    // sessionId lives in localStorage (apps/store/lib/cart.tsx), so the
    // server cannot verify that the caller actually owns it — accepting it
    // would let an attacker absorb any victim's guest cart by submitting
    // their sessionId during login. If we ever move the cart sessionId into
    // a signed HTTP-only cookie, ownership becomes verifiable and merge can
    // be reintroduced safely.

    return NextResponse.json({
      ok: true,
      customer: { id: customer.id, name },
    });
  } catch (err) {
    console.error("[L-TEX] customer login failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
