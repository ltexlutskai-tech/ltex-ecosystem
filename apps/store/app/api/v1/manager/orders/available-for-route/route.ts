import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/orders/available-for-route — пікер замовлень для МЛ.
 *
 * Повертає замовлення, які **ще не в жодному маршруті** (`routeSheetId IS
 * NULL`) — 1С-правило «одне замовлення в одному МЛ» (`ЗаказыЗаказПокупателя
 * НачалоВыбора`). Опційний `?routeSheetId=<id>` додатково включає замовлення,
 * вже прикріплені до ЦЬОГО МЛ (щоб під час редагування вони не зникали з
 * пікера). Опційний `?search=` — по № / клієнту.
 *
 * Мінімальний shape для пікера: id, номер (code1C), клієнт, місто, сума.
 * Архівні замовлення не показуються.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const routeSheetId = url.searchParams.get("routeSheetId")?.trim() ?? "";
  const search = url.searchParams.get("search")?.trim() ?? "";

  // Виключаємо замовлення, що вже в іншому маршруті: routeSheetId === null
  // АБО (опційно) дорівнює поточному МЛ.
  const routeFilter: Prisma.OrderWhereInput = routeSheetId
    ? { OR: [{ routeSheetId: null }, { routeSheetId }] }
    : { routeSheetId: null };

  const where: Prisma.OrderWhereInput = {
    archived: false,
    ...routeFilter,
  };

  if (search.length > 0) {
    where.AND = [
      {
        OR: [
          { code1C: { contains: search, mode: "insensitive" } },
          { customer: { name: { contains: search, mode: "insensitive" } } },
          { customer: { city: { contains: search, mode: "insensitive" } } },
        ],
      },
    ];
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      code1C: true,
      totalEur: true,
      totalUah: true,
      routeSheetId: true,
      customer: { select: { id: true, name: true, city: true } },
    },
  });

  return NextResponse.json({
    items: orders.map((o) => ({
      id: o.id,
      orderNumber: o.code1C,
      totalEur: o.totalEur,
      totalUah: o.totalUah,
      alreadyOnThisSheet: routeSheetId
        ? o.routeSheetId === routeSheetId
        : false,
      customer: {
        id: o.customer.id,
        name: o.customer.name,
        city: o.customer.city,
      },
    })),
  });
}
