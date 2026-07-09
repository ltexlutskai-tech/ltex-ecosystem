import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/sale-ownership";
import {
  buildSalesWhere,
  normalizeSaleStatus,
  saleRowInclude,
  serializeSaleRow,
} from "@/lib/manager/sales-list";
import {
  createSaleSchema,
  saleDraftSchema,
} from "@/lib/validations/manager-sale";
import {
  createSaleDraft,
  createSaleWithItems,
} from "@/lib/manager/sale-create";
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
  const status = normalizeSaleStatus(
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

  const where = buildSalesWhere({
    scope: myCodes,
    clientCode1C: clientCode1C || undefined,
    search,
    status,
    from,
    to,
    showArchived,
  });

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: saleRowInclude,
    }),
    prisma.sale.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((s) => {
      const row = serializeSaleRow(s);
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

type ManagerUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Створення чернетки реалізації (autosave, `draft:true`). Послаблена валідація
 * (`saleDraftSchema`), той самий ownership, що й strict-POST, але створення БЕЗ
 * ефектів проведення (`createSaleDraft`). Повертає `{ id }`.
 *
 * Не експортується з route-файлу (лише HTTP-методи є експортами) — це локальний
 * хелпер POST.
 */
async function createDraftSale(
  body: unknown,
  user: ManagerUser,
): Promise<NextResponse> {
  const parsed = saleDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // `Sale.customerId` — обов'язковий FK: draft-рядок неможливий без клієнта.
  // До вибору клієнта прогрес захищає локальна копія (рівень 1 автозбереження).
  if (!input.customerId) {
    return NextResponse.json(
      { error: "Виберіть клієнта, щоб зберегти чернетку" },
      { status: 400 },
    );
  }

  let customer;
  try {
    customer = await resolveCustomerForOrder(input.customerId);
  } catch (err) {
    if (err instanceof ResolveCustomerError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Ownership: manager — лише свої клієнти; admin — будь-кого.
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    if (!customer.code1C || !myCodes.includes(customer.code1C)) {
      return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
    }
  }

  if (input.routeSheetId) {
    const routeSheet = await prisma.routeSheet.findUnique({
      where: { id: input.routeSheetId },
      select: { id: true },
    });
    if (!routeSheet) {
      return NextResponse.json(
        { error: "Маршрутний лист не знайдено" },
        { status: 404 },
      );
    }
  }

  try {
    const sale = await createSaleDraft(input, customer, { userId: user.id });
    return NextResponse.json(
      { id: sale.id, status: sale.status },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003" || err.code === "P2025") {
        return NextResponse.json(
          { error: "Невалідний product/lot у items" },
          { status: 400 },
        );
      }
    }
    console.error("[L-TEX] Sale draft create failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка збереження чернетки" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  // ─── Автозбереження чернетки (draft) ──────────────────────────────────────
  // `draft === true` → послаблена схема, створення БЕЗ ефектів проведення.
  if (body && typeof body === "object" && (body as { draft?: unknown }).draft) {
    return createDraftSale(body, user);
  }

  const parsed = createSaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // ClientPicker віддає MgrClient.id; Sale.customerId — FK на Customer (інша
  // модель). Резолвимо у Customer за спільним code1C (find-or-create), щоб
  // уникнути FK-помилки «Клієнта не знайдено». `resolveCustomerForOrder`
  // generic — підходить і для реалізації.
  let customer;
  try {
    customer = await resolveCustomerForOrder(input.customerId);
  } catch (err) {
    if (err instanceof ResolveCustomerError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Ownership check: manager — only own clients; admin — будь-кого.
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    if (!customer.code1C || !myCodes.includes(customer.code1C)) {
      return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
    }
  }

  // Зворотне посилання на Маршрутний лист (коли реалізацію створено зсередини
  // МЛ). Перевіряємо існування; ownership — будь-який менеджер (МЛ спільні).
  if (input.routeSheetId) {
    const routeSheet = await prisma.routeSheet.findUnique({
      where: { id: input.routeSheetId },
      select: { id: true },
    });
    if (!routeSheet) {
      return NextResponse.json(
        { error: "Маршрутний лист не знайдено" },
        { status: 404 },
      );
    }
  }

  try {
    const sale = await createSaleWithItems(input, customer, {
      userId: user.id,
    });
    return NextResponse.json(
      {
        id: sale.id,
        code1C: sale.code1C,
        docNumber: sale.docNumber,
        status: sale.status,
        totalEur: sale.totalEur,
        totalUah: sale.totalUah,
        exchangeRateEur: sale.exchangeRateEur,
        exchangeRateUsd: sale.exchangeRateUsd,
        notes: sale.notes,
        priceTypeId: sale.priceTypeId,
        deliveryMethod: sale.deliveryMethod,
        novaPoshtaBranch: sale.novaPoshtaBranch,
        cashOnDelivery: sale.cashOnDelivery,
        codAmountUah: sale.codAmountUah,
        assignedAgentUserId: sale.assignedAgentUserId,
        onTradeAgent: sale.onTradeAgent,
        exportTo1C: sale.exportTo1C,
        expressWaybill: sale.expressWaybill,
        routeSheetId: sale.routeSheetId,
        createdAt: sale.createdAt.toISOString(),
        customer: sale.customer,
        items: sale.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          lotId: i.lotId,
          barcode: i.barcode,
          pricePerKg: i.pricePerKg,
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
    console.error("[L-TEX] Sale create failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка створення реалізації" },
      { status: 500 },
    );
  }
}
