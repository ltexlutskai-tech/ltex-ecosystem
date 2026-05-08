import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { setCustomerCookie } from "@/lib/customer-auth";
import { notifyNewLead } from "@/lib/notifications";

const schema = z.object({
  phone: z.string().min(8).max(32),
  name: z.string().min(1).max(100),
  sessionId: z.string().min(1).max(100).optional(),
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

  try {
    let wasCreated = false;
    let customer = await prisma.customer.findFirst({
      where: { phone },
      select: { id: true, name: true },
    });
    if (!customer) {
      customer = await prisma.customer.create({
        data: { phone, name },
        select: { id: true, name: true },
      });
      wasCreated = true;
    } else if (customer.name !== name) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { name },
      });
    }

    await setCustomerCookie(customer.id);

    if (wasCreated) {
      notifyNewLead({
        customerId: customer.id,
        phone,
        name,
        source: "web",
      }).catch(() => {});
    }

    // Cart merge: if a guest cart exists for this sessionId, attach it to the
    // customer (or fold its items into the customer's existing cart).
    const sessionId = parsed.data.sessionId;
    if (sessionId) {
      try {
        await mergeGuestCartIntoCustomer(sessionId, customer.id);
      } catch (err) {
        console.warn("[L-TEX] cart merge on login failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

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

async function mergeGuestCartIntoCustomer(
  sessionId: string,
  customerId: string,
): Promise<void> {
  const guestCart = await prisma.cart.findUnique({
    where: { sessionId },
    include: { items: true },
  });
  if (!guestCart) return;

  const customerCart = await prisma.cart.findUnique({
    where: { customerId },
    include: { items: true },
  });

  if (!customerCart) {
    // Promote the guest cart into the customer cart.
    await prisma.cart.update({
      where: { id: guestCart.id },
      data: { customerId, sessionId: null },
    });
    return;
  }

  // Merge: skip duplicates (same lotId or same productId for general items).
  const existingKeys = new Set(
    customerCart.items.map((i) =>
      i.lotId ? `lot:${i.lotId}` : `product:${i.productId}`,
    ),
  );
  for (const item of guestCart.items) {
    const key = item.lotId ? `lot:${item.lotId}` : `product:${item.productId}`;
    if (existingKeys.has(key)) continue;
    await prisma.cartItem
      .create({
        data: {
          cartId: customerCart.id,
          lotId: item.lotId,
          productId: item.productId,
          priceEur: item.priceEur,
          weight: item.weight,
          quantity: item.quantity,
        },
      })
      .catch(() => {
        // Defensive: ignore any conflict (race / unique).
      });
    existingKeys.add(key);
  }
  await prisma.cart.delete({ where: { id: guestCart.id } });
}
