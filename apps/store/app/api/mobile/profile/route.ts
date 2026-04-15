import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { mobileProfileUpdateSchema } from "@/lib/validations";
import { requireMobileSession } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/profile — current customer profile with stats.
 * PUT /api/mobile/profile — update fields of the current customer.
 *
 * Auth: Bearer <mobile token>. customerId is derived from the token, never from the body.
 */
export async function GET(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      _count: {
        select: { orders: true, favorites: true, videoSubscriptions: true },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Aggregate order stats
  const orderStats = await prisma.order.aggregate({
    where: { customerId },
    _sum: { totalEur: true, totalUah: true },
    _count: true,
  });

  return NextResponse.json({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    telegram: customer.telegram,
    city: customer.city,
    createdAt: customer.createdAt,
    stats: {
      totalOrders: orderStats._count,
      totalSpentEur: orderStats._sum.totalEur ?? 0,
      totalSpentUah: orderStats._sum.totalUah ?? 0,
      favoriteCount: customer._count.favorites,
      subscriptionCount: customer._count.videoSubscriptions,
    },
  });
}

export async function PUT(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Ignore any customerId from the body; schema still validates other fields.
  const parsed = mobileProfileUpdateSchema.safeParse({
    ...(body as Record<string, unknown>),
    customerId,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }
  const { name, email, telegram, city } = parsed.data;

  const data: Record<string, string | null> = {};
  if (name) data.name = name;
  if (email !== undefined) data.email = email ?? null;
  if (telegram !== undefined) data.telegram = telegram ?? null;
  if (city !== undefined) data.city = city ?? null;

  const customer = await prisma.customer.update({
    where: { id: customerId },
    data,
  });

  return NextResponse.json({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    telegram: customer.telegram,
    city: customer.city,
  });
}
