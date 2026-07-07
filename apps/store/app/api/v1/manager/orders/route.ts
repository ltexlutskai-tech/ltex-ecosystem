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
import {
  findOtherActiveOrder,
  canForceActive,
} from "@/lib/manager/order-active-guard";
import { formatOrderNumber } from "@/lib/manager/order-number";
import {
  resolveCustomerForOrder,
  ResolveCustomerError,
} from "@/lib/manager/resolve-customer";

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
  const sourceRaw = url.searchParams.get("source")?.trim() ?? "";
  const source: "site" | "manual" | "" =
    sourceRaw === "site" || sourceRaw === "manual" ? sourceRaw : "";
  const page = parseInteger(url.searchParams.get("page"), 1, 1, 9_999);
  const pageSize = parseInteger(url.searchParams.get("pageSize"), 20, 10, 100);

  // Visibility scope (manager → свої клієнти по code1C АБО призначений агент).
  // 7.2 Блок 2: НЕ короткозамикаємо на 0 клієнтів — менеджер може бути
  // призначеним агентом сайтових замовлень (клієнт без code1C).
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    // Deeplink по чужому клієнту → нічого не видно (не послаблюємо ownership).
    if (clientCode1C && !myCodes.includes(clientCode1C)) {
      return NextResponse.json({ items: [], total: 0, page, pageSize });
    }
  }

  const where = buildOrdersWhere({
    customerCodes: myCodes,
    viewerUserId: user.id,
    clientCode1C: clientCode1C || undefined,
    q: search,
    status,
    from,
    to,
    showArchived,
    source,
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

  const url = new URL(req.url);
  const body = await req.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // ClientPicker віддає MgrClient.id; Order.customerId — FK на Customer (інша
  // модель). Резолвимо у Customer за спільним code1C (find-or-create), щоб
  // уникнути FK-помилки «Клієнта не знайдено».
  let customer;
  try {
    customer = await resolveCustomerForOrder(input.customerId);
  } catch (err) {
    if (err instanceof ResolveCustomerError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Ownership check: manager — only own clients; admin — будь-кого
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    if (!customer.code1C || !myCodes.includes(customer.code1C)) {
      return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
    }
  }

  // ─── Актуальність guard (N1) ─────────────────────────────────────────────
  // У клієнта має бути максимум ОДНЕ активне замовлення
  // (isActual=true AND archived=false AND closedAt IS NULL). Якщо вже є —
  // блокуємо (409), допоки не передано `force` від admin/owner/senior_manager.
  const force =
    url.searchParams.get("force") === "true" || input.force === true;

  const existingActive = await findOtherActiveOrder(customer.id);

  if (existingActive && !force) {
    return NextResponse.json(
      {
        code: "active_order_exists",
        existingOrderId: existingActive.id,
        existingOrderNumber: formatOrderNumber(existingActive),
      },
      { status: 409 },
    );
  }

  // Force дозволено лише привілейованим ролям.
  const canForce = canForceActive(user.role);
  if (existingActive && force && !canForce) {
    return NextResponse.json(
      { error: "Лише адмін/власник може створити друге активне замовлення" },
      { status: 403 },
    );
  }

  // Якщо force застосовується — у транзакції знімаємо isActual зі старих.
  const clearOtherActual = Boolean(existingActive && force && canForce);

  try {
    const order = await createOrderWithItems(
      input,
      customer,
      { userId: user.id },
      { clearOtherActual },
    );
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
