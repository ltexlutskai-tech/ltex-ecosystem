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
 * пікера). Архівні замовлення не показуються.
 *
 * Фільтри (server-side):
 *  • `?search=` — по № / клієнту / місту;
 *  • `?city=` — текст по `Customer.city`;
 *  • `?from=` / `?to=` — діапазон по `Order.createdAt` (дата замовлення).
 *
 * Область (`region`) у `Customer` немає — резолвимо batch-ом з відповідного
 * `MgrClient` (match `Customer.code1C === MgrClient.code1C`). `?region=`
 * фільтрує по знайденій області (client-side над вибіркою — `Order` не має
 * relation на `MgrClient`).
 *
 * Shape рядка: id, номер (code1C), дата, клієнт, місто, область, сума (€+₴).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const routeSheetId = url.searchParams.get("routeSheetId")?.trim() ?? "";
  const search = url.searchParams.get("search")?.trim() ?? "";
  const city = url.searchParams.get("city")?.trim() ?? "";
  const region = url.searchParams.get("region")?.trim() ?? "";

  function parseDate(raw: string | null): Date | undefined {
    if (!raw) return undefined;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));

  // Виключаємо замовлення, що вже в іншому маршруті: routeSheetId === null
  // АБО (опційно) дорівнює поточному МЛ.
  const routeFilter: Prisma.OrderWhereInput = routeSheetId
    ? { OR: [{ routeSheetId: null }, { routeSheetId }] }
    : { routeSheetId: null };

  const where: Prisma.OrderWhereInput = {
    archived: false,
    ...routeFilter,
  };

  const and: Prisma.OrderWhereInput[] = [];

  if (search.length > 0) {
    and.push({
      OR: [
        { code1C: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { customer: { city: { contains: search, mode: "insensitive" } } },
      ],
    });
  }

  if (city.length > 0) {
    and.push({ customer: { city: { contains: city, mode: "insensitive" } } });
  }

  if (from || to) {
    and.push({
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      },
    });
  }

  if (and.length > 0) where.AND = and;

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      code1C: true,
      createdAt: true,
      totalEur: true,
      totalUah: true,
      routeSheetId: true,
      customer: { select: { id: true, name: true, city: true, code1C: true } },
    },
  });

  // Область — батч-резолв з MgrClient (Customer.code1C === MgrClient.code1C).
  const clientCodes = [
    ...new Set(
      orders
        .map((o) => o.customer.code1C)
        .filter((c): c is string => Boolean(c)),
    ),
  ];
  const mgrClients =
    clientCodes.length > 0
      ? await prisma.mgrClient.findMany({
          where: { code1C: { in: clientCodes } },
          select: { code1C: true, region: true },
        })
      : [];
  const regionByCode = new Map<string, string | null>();
  for (const mc of mgrClients) {
    if (mc.code1C) regionByCode.set(mc.code1C, mc.region);
  }

  const mapped = orders.map((o) => {
    const orderRegion = o.customer.code1C
      ? (regionByCode.get(o.customer.code1C) ?? null)
      : null;
    return {
      id: o.id,
      orderNumber: o.code1C,
      orderDate: o.createdAt.toISOString(),
      totalEur: o.totalEur,
      totalUah: o.totalUah,
      alreadyOnThisSheet: routeSheetId
        ? o.routeSheetId === routeSheetId
        : false,
      customer: {
        id: o.customer.id,
        name: o.customer.name,
        city: o.customer.city,
        region: orderRegion,
      },
    };
  });

  // Область — фільтр client-side над вибіркою (Order не має relation на MgrClient).
  const items =
    region.length > 0
      ? mapped.filter((o) =>
          (o.customer.region ?? "")
            .toLowerCase()
            .includes(region.toLowerCase()),
        )
      : mapped;

  return NextResponse.json({ items });
}
