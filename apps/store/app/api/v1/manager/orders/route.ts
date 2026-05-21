import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/order-ownership";
import {
  buildOrdersWhere,
  normalizeOrderStatus,
  orderRowInclude,
  serializeOrderRow,
} from "@/lib/manager/orders-list";
import { createOrderSchema } from "@/lib/validations/manager-order";
import { createOrderWithItems } from "@/lib/manager/order-create";

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
  const status = normalizeOrderStatus(
    url.searchParams.get("status")?.trim() ?? "",
  );
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  const clientCode1C = url.searchParams.get("clientCode1C")?.trim() ?? "";
  const showArchived = url.searchParams.get("showArchived") === "true";
  const page = parseInteger(url.searchParams.get("page"), 1, 1, 9_999);
  const pageSize = parseInteger(url.searchParams.get("pageSize"), 20, 10, 100);

  // Visibility scope (manager → тільки свої клієнти)
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    // Manager без жодного призначеного клієнта → нічого не видно.
    if (myCodes.length === 0) {
      return NextResponse.json({ items: [], total: 0, page, pageSize });
    }
    // Deeplink по чужому клієнту → нічого не видно (не послаблюємо ownership).
    if (clientCode1C && !myCodes.includes(clientCode1C)) {
      return NextResponse.json({ items: [], total: 0, page, pageSize });
    }
  }

  const where = buildOrdersWhere({
    customerCodes: myCodes,
    clientCode1C: clientCode1C || undefined,
    q: search,
    status,
    from,
    to,
    showArchived,
  });

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: orderRowInclude,
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((o) => {
      const row = serializeOrderRow(o);
      return {
        ...row,
        createdAt: row.createdAt.toISOString(),
      };
    }),
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
