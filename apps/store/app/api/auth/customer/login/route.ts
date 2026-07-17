import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { normalizePhone, phoneMatchKey } from "@ltex/shared";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { setCustomerCookie } from "@/lib/customer-auth";
import { notifyNewLead } from "@/lib/notifications";
import { createSiteLead } from "@/lib/manager/site-lead";
import { getRegionLabel, isValidRegionSlug } from "@/lib/constants/regions";

const schema = z.object({
  phone: z.string().min(8).max(32),
  name: z.string().min(1).max(100),
  // Область (slug з UA_REGIONS) — ОБОВʼЯЗКОВА при реєстрації. За нею лід
  // одразу маршрутизується на менеджера (мапа MgrRegionAgent).
  region: z.string().refine(isValidRegionSlug, "Оберіть область"),
  // legacy — не використовується формою, лишено для сумісності.
  city: z.string().max(100).optional().nullable(),
});

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
  const phoneKey = phoneMatchKey(parsed.data.phone);
  if (!phone || !phoneKey) {
    return NextResponse.json(
      { error: "Невірний номер телефону" },
      { status: 400 },
    );
  }
  const name = parsed.data.name.trim();
  const regionSlug = parsed.data.region;
  const region = getRegionLabel(regionSlug);

  try {
    let wasCreated = false;
    // Звірка з наявним покупцем — по останніх 9 цифрах (незалежно від формату).
    let customer = await prisma.customer.findFirst({
      where: { phoneKey },
      select: { id: true, name: true, region: true },
    });
    if (!customer) {
      customer = await prisma.customer.create({
        data: { phone, name, region },
        select: { id: true, name: true, region: true },
      });
      wasCreated = true;
    } else {
      // For existing customers: never overwrite name/region the user set in
      // /account. Only fill empty/null fields from the login payload.
      const updates: { name?: string; region?: string | null } = {};
      if (!customer.name?.trim() && name) {
        updates.name = name;
      }
      if (customer.region == null && region) {
        updates.region = region;
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
        city: region,
        source: "web",
      }).catch(() => {});
      // CRM-лід (не повноцінний клієнт) — окрема вкладка в «Клієнтах».
      // Область → назва в лід + підвʼязка менеджера за мапою «область→агент».
      createSiteLead({ name, phone, regionSlug }).catch(() => {});
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
