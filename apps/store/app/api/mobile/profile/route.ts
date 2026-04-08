import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { mobileProfileUpdateSchema } from "@/lib/validations";

/**
 * GET /api/mobile/profile?customerId=xxx
 * Returns full customer profile with stats.
 *
 * PUT /api/mobile/profile
 * Body: { customerId, name?, email?, telegram?, city?, notes? }
 * Updates customer profile.
 */
export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId");
  if (!customerId) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = mobileProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }
  const { customerId, name, email, telegram, city } = parsed.data;

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
