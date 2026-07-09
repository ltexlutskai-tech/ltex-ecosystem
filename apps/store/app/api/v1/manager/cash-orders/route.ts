import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/sale-ownership";
import {
  createCashOrderDraft,
  createPaymentOrders,
} from "@/lib/manager/cash-order";
import {
  resolveCustomerForOrder,
  ResolveCustomerError,
} from "@/lib/manager/resolve-customer";
import {
  cashOrderDraftSchema,
  processPaymentSchema,
} from "@/lib/validations/manager-cash-order";
import {
  buildCashOrdersWhere,
  cashOrderRowInclude,
  normalizeCashOrderType,
  serializeCashOrderRow,
} from "@/lib/manager/cash-orders-list";
import {
  buildPaymentEventBody,
  recordClientEventSafe,
} from "@/lib/manager/client-timeline";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Блок «Оплати / Каса» — Етап 1. Список касових ордерів (1С ФормаСписка
 * КассовыйОрдер) з ownership-фільтром, пошуком, фільтром виду/архіву/періоду.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() || undefined;
  const type = normalizeCashOrderType(
    url.searchParams.get("type") ?? undefined,
  );
  const archived = url.searchParams.get("archived") === "true";
  const fromRaw = url.searchParams.get("from") ?? "";
  const toRaw = url.searchParams.get("to") ?? "";

  const pageNum = Number.parseInt(url.searchParams.get("page") ?? "", 10);
  const pageSizeNum = Number.parseInt(
    url.searchParams.get("pageSize") ?? "",
    10,
  );
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const pageSize =
    Number.isFinite(pageSizeNum) &&
    pageSizeNum >= 10 &&
    pageSizeNum <= MAX_PAGE_SIZE
      ? pageSizeNum
      : DEFAULT_PAGE_SIZE;

  const myCodes = await getMyClientCodes1C(user);
  // Manager без призначених клієнтів → порожній список (без зайвих запитів).
  if (myCodes !== null && myCodes.length === 0) {
    return NextResponse.json({ items: [], total: 0, page, pageSize });
  }

  const fromDate = fromRaw ? new Date(fromRaw) : undefined;
  const toDate = toRaw ? new Date(toRaw) : undefined;

  const where = buildCashOrdersWhere({
    scope: myCodes,
    search,
    type,
    archived,
    from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
    to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
  });

  const [items, total] = await Promise.all([
    prisma.mgrCashOrder.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: cashOrderRowInclude,
    }),
    prisma.mgrCashOrder.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((o) => serializeCashOrderRow(o)),
    total,
    page,
    pageSize,
  });
}

/**
 * Блок «Оплати / Каса» — Етап 2. Створення касового ордера (порт 1С обробки
 * «Оплата»). EUR-base модель (`docs/PAYMENTS_BLOCK_AUDIT.md` §B).
 *
 * Підстава — реалізація (`saleId`) АБО клієнт (`clientId` = MgrClient.id,
 * резолвиться у Customer через code1C). Курси-знімок беруться з форми
 * (`rateEur`/`rateUsd`). 4 канали фактичної оплати + ручна решта у 3 валютах;
 * при здачі > 0 авто-створюється ордер-розхід (`changeForId`). Анти-дубля немає
 * (кілька оплат на одну реалізацію дозволено).
 */
type ManagerUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Створення чернетки касового ордера (autosave, `draft:true`). Послаблена
 * валідація (`cashOrderDraftSchema`), той самий ownership, що й strict-POST, але
 * запис БЕЗ ефектів проведення (`createCashOrderDraft` — без здачі/ДДС/боргу).
 * Повертає `{ id }`. Локальний хелпер POST (не HTTP-метод — не експортується).
 */
async function createDraftCashOrder(
  body: unknown,
  user: ManagerUser,
): Promise<NextResponse> {
  const parsed = cashOrderDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const myCodes = await getMyClientCodes1C(user);
  let saleId: string | null = null;
  let customerId: string | null = null;

  if (input.saleId) {
    const sale = await prisma.sale.findUnique({
      where: { id: input.saleId },
      select: { id: true, customer: { select: { id: true, code1C: true } } },
    });
    if (!sale) {
      return NextResponse.json(
        { error: "Реалізацію не знайдено" },
        { status: 404 },
      );
    }
    if (myCodes !== null) {
      if (!sale.customer.code1C || !myCodes.includes(sale.customer.code1C)) {
        return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
      }
    }
    saleId = sale.id;
    customerId = sale.customer.id;
  } else if (input.clientId) {
    let resolved;
    try {
      resolved = await resolveCustomerForOrder(input.clientId);
    } catch (err) {
      if (err instanceof ResolveCustomerError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status },
        );
      }
      throw err;
    }
    if (myCodes !== null) {
      if (!resolved.code1C || !myCodes.includes(resolved.code1C)) {
        return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
      }
    }
    customerId = resolved.id;
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
    const draft = await createCashOrderDraft({
      saleId,
      customerId,
      type: input.type ?? "income",
      paid: {
        uah: input.amountUah ?? 0,
        eur: input.amountEur ?? 0,
        usd: input.amountUsd ?? 0,
        uahCashless: input.amountUahCashless ?? 0,
      },
      bankAccountId: input.bankAccountId ?? null,
      cashFlowArticleId: input.cashFlowArticleId ?? null,
      comment: input.comment ?? null,
      rates: { eur: input.rateEur ?? 0, usd: input.rateUsd ?? 0 },
      agentUserId: user.id,
      routeSheetId: input.routeSheetId ?? null,
    });
    return NextResponse.json(
      { id: draft.id, status: draft.status },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003" || err.code === "P2025") {
        return NextResponse.json(
          { error: "Невалідні дані оплати" },
          { status: 400 },
        );
      }
    }
    console.error("[L-TEX] Cash order draft create failed", {
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
    return createDraftCashOrder(body, user);
  }

  const parsed = processPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Скоуп ownership: manager — лише свої клієнти; admin — будь-кого.
  const myCodes = await getMyClientCodes1C(user);

  let saleId: string | null = null;
  let customerId: string | null = null;

  // ─── Резолв платника + ownership ───────────────────────────────────────────
  if (input.saleId) {
    const sale = await prisma.sale.findUnique({
      where: { id: input.saleId },
      select: { id: true, customer: { select: { id: true, code1C: true } } },
    });
    if (!sale) {
      return NextResponse.json(
        { error: "Реалізацію не знайдено" },
        { status: 404 },
      );
    }
    if (myCodes !== null) {
      if (!sale.customer.code1C || !myCodes.includes(sale.customer.code1C)) {
        return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
      }
    }
    saleId = sale.id;
    customerId = sale.customer.id;
  } else if (input.clientId) {
    let resolved;
    try {
      resolved = await resolveCustomerForOrder(input.clientId);
    } catch (err) {
      if (err instanceof ResolveCustomerError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status },
        );
      }
      throw err;
    }
    if (myCodes !== null) {
      if (!resolved.code1C || !myCodes.includes(resolved.code1C)) {
        return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
      }
    }
    customerId = resolved.id;
  }

  // ─── Гард банк. рахунку при приході (1С §F) ─────────────────────────────────
  if (input.type === "income" && input.bankAccountId) {
    const acct = await prisma.mgrBankAccount.findUnique({
      where: { id: input.bankAccountId },
      select: { hiddenInApp: true },
    });
    if (acct?.hiddenInApp) {
      return NextResponse.json(
        { error: "Цей рахунок не можна вибирати при приході" },
        { status: 400 },
      );
    }
  }

  // Зворотне посилання на Маршрутний лист (коли оплату створено зсередини МЛ).
  // Перевіряємо існування; ownership — будь-який менеджер (МЛ спільні).
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

  const rates = { eur: input.rateEur, usd: input.rateUsd };

  try {
    const { income, change } = await createPaymentOrders({
      saleId,
      customerId,
      type: input.type,
      paid: {
        uah: input.amountUah,
        eur: input.amountEur,
        usd: input.amountUsd,
        uahCashless: input.amountUahCashless,
      },
      change: {
        uah: input.changeUah,
        eur: input.changeEur,
        usd: input.changeUsd,
      },
      bankAccountId: input.bankAccountId ?? null,
      cashFlowArticleId: input.cashFlowArticleId ?? null,
      comment: input.comment ?? null,
      post: input.post,
      rates,
      sumToPayEur: input.sumToPayEur,
      agentUserId: user.id,
      routeSheetId: input.routeSheetId ?? null,
    });

    // Авто-запис історії клієнта (Фаза 4) — лише прихідний ордер, fire-and-forget.
    // Пропускається коли платник невідомий (customerId === null).
    if (customerId) {
      recordClientEventSafe({
        customerId,
        kind: "payment",
        body: buildPaymentEventBody({
          amountUah: income.amountUah,
          amountEur: income.amountEur,
          amountUsd: income.amountUsd,
          type: income.type,
        }),
        authorUserId: user.id,
        metadata: { cashOrderId: income.id, saleId },
      });
    }

    return NextResponse.json({ income, change }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003" || err.code === "P2025") {
        return NextResponse.json(
          { error: "Невалідні дані оплати" },
          { status: 400 },
        );
      }
    }
    console.error("[L-TEX] Cash order create failed", {
      saleId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка створення оплати" },
      { status: 500 },
    );
  }
}
