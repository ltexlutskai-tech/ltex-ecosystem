import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const client = await prisma.mgrClient.findUnique({
    where: { id },
    select: {
      id: true,
      code1C: true,
      agentUserId: true,
      assignments: {
        where: { userId: user.id },
        select: { id: true },
      },
    },
  });
  if (!client) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  if (user.role !== "admin") {
    const isMine =
      client.agentUserId === user.id || client.assignments.length > 0;
    if (!isMine) {
      return NextResponse.json(
        { error: "Цей клієнт належить іншому менеджеру" },
        { status: 403 },
      );
    }
  }

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = 10;

  if (!client.code1C) {
    return NextResponse.json({ items: [], total: 0, page, pageSize });
  }

  const where = { customer: { code1C: client.code1C } };

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((o) => ({
      id: o.id,
      code1C: o.code1C,
      status: o.status,
      totalEur: o.totalEur,
      totalUah: o.totalUah,
      itemCount: o._count.items,
      createdAt: o.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  });
}
