import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/order-ownership";
import {
  ORDER_STATUS_LIST,
  type OrderStatus,
} from "@/lib/manager/order-status";
import { createOrderSchema } from "@/lib/validations/manager-order";
import { createOrderWithItems } from "@/lib/manager/order-create";

const ORDER_STATUS_SET: Set<string> = new Set(ORDER_STATUS_LIST);

function parseInteger(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const statusRaw = url.searchParams.get("status")?.trim() ?? "";
  const status: OrderStatus | "" = ORDER_STATUS_SET.has(statusRaw)
    ? (statusRaw as OrderStatus)
    : "";
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  const clientCode1C = url.searchParams.get("clientCode1C")?.trim() ?? "";
  const page = parseInteger(url.searchParams.get("page"), 1, 1, 9_999);
  const pageSize = parseInteger(url.searchParams.get("pageSize"), 20, 10, 100);

  const where: Prisma.OrderWhereInput = {};
  const customerWhere: Prisma.CustomerWhereInput = {};

  // Visibility scope (manager → тільки свої клієнти)
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    if (myCodes.length === 0) {
      return NextResponse.json({ items: [], total: 0, page, pageSize });
    }
    customerWhere.code1C = { in: myCodes };
  }

  // Optional clientCode1C scope (deeplink з картки клієнта)
  if (clientCode1C) {
    if (myCodes !== null && !myCodes.includes(clientCode1C)) {
      return NextResponse.json({ items: [], total: 0, page, pageSize });
    }
    customerWhere.code1C = clientCode1C;
  }

  if (Object.keys(customerWhere).length > 0) {
    where.customer = customerWhere;
  }

  // Search by code1C OR customer.name
  if (search) {
    where.OR = [
      { code1C: { contains: search, mode: "insensitive" } },
      { customer: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  if (status) where.status = status;

  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, code1C: true } },
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
      customer: {
        id: o.customer.id,
        name: o.customer.name,
        code1C: o.customer.code1C,
      },
    })),
    total,
    page,
    pageSize,
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, code1C: true, name: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  // Ownership check: manager — only own clients; admin — будь-кого
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    if (!customer.code1C || !myCodes.includes(customer.code1C)) {
      return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
    }
  }

  try {
    const order = await createOrderWithItems(input, customer, {
      userId: user.id,
    });
    return NextResponse.json(
      {
        id: order.id,
        code1C: order.code1C,
        status: order.status,
        totalEur: order.totalEur,
        totalUah: order.totalUah,
        exchangeRate: order.exchangeRate,
        notes: order.notes,
        priceTypeId: order.priceTypeId,
        deliveryMethod: order.deliveryMethod,
        cashOnDelivery: order.cashOnDelivery,
        assignedAgentUserId: order.assignedAgentUserId,
        exportTo1C: order.exportTo1C,
        createdAt: order.createdAt.toISOString(),
        customer: order.customer,
        items: order.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          lotId: i.lotId,
          priceEur: i.priceEur,
          weight: i.weight,
          quantity: i.quantity,
        })),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // FK violation — невалідний productId/lotId
      if (err.code === "P2003" || err.code === "P2025") {
        return NextResponse.json(
          { error: "Невалідний product/lot у items" },
          { status: 400 },
        );
      }
    }
    console.error("[L-TEX] Order create failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка створення замовлення" },
      { status: 500 },
    );
  }
}
