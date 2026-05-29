import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/order-ownership";
import {
  closeClosuresViaOnec,
  fetchClosuresFromOnec,
  type CloseClosuresItem,
} from "@/lib/manager/closures-sync";
import { recordClientEventSafe } from "@/lib/manager/client-timeline";
import { createOrderWithItems } from "@/lib/manager/order-create";

/**
 * M3.4 Closures — GET + POST для блоку «Закриття старих замовлень».
 *
 * `[clientId]` — це **MgrClient.id** (наш UI завжди передає його з ClientPicker
 * чи з `clientCode1C` лукапу). Резолвимо у `code1C` для виклику 1С.
 *
 * Ownership: manager — тільки свої клієнти (через `getMyClientCodes1C`);
 * admin — будь-який. Чужий клієнт → 403.
 */

interface RouteContext {
  params: Promise<{ clientId: string }>;
}

async function resolveClientCode(clientId: string): Promise<{
  code1C: string;
  mgrClientId: string;
  customerId: string | null;
} | null> {
  const mgr = await prisma.mgrClient.findUnique({
    where: { id: clientId },
    select: { id: true, code1C: true },
  });
  if (mgr?.code1C) {
    const customer = await prisma.customer.findUnique({
      where: { code1C: mgr.code1C },
      select: { id: true },
    });
    return {
      code1C: mgr.code1C,
      mgrClientId: mgr.id,
      customerId: customer?.id ?? null,
    };
  }
  return null;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const { clientId } = await ctx.params;
  if (!clientId) {
    return NextResponse.json({ error: "Невалідний clientId" }, { status: 400 });
  }
  const resolved = await resolveClientCode(clientId);
  if (!resolved) {
    return NextResponse.json(
      { error: "Клієнт не знайдений або без code1C" },
      { status: 404 },
    );
  }
  // Ownership: тільки свої або admin.
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null && !myCodes.includes(resolved.code1C)) {
    return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
  }

  const result = await fetchClosuresFromOnec(resolved.code1C);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.errorMessage ?? "Помилка отримання з 1С" },
      { status: 502 },
    );
  }
  return NextResponse.json({ items: result.items });
}

interface PostBody {
  items?: unknown;
  idempotencyKey?: unknown;
}

function parseItems(raw: unknown): CloseClosuresItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const result: CloseClosuresItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") return null;
    const r = it as Record<string, unknown>;
    if (
      typeof r.orderUid !== "string" ||
      typeof r.productUid !== "string" ||
      typeof r.quantity !== "number" ||
      typeof r.price !== "number" ||
      typeof r.addToNewOrder !== "boolean"
    ) {
      return null;
    }
    if (r.orderUid.length === 0 || r.productUid.length === 0) return null;
    if (r.quantity < 1 || r.price < 0) return null;
    result.push({
      orderUid: r.orderUid,
      productUid: r.productUid,
      quantity: r.quantity,
      price: r.price,
      addToNewOrder: r.addToNewOrder,
    });
  }
  return result;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const { clientId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as PostBody | null;
  if (!body) {
    return NextResponse.json({ error: "Невалідний JSON" }, { status: 400 });
  }
  const items = parseItems(body.items);
  if (!items) {
    return NextResponse.json(
      { error: "Невалідний items[] (нема позицій або порушено shape)" },
      { status: 400 },
    );
  }
  const idempotencyKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey.length > 0
      ? body.idempotencyKey
      : randomUUID();

  const resolved = await resolveClientCode(clientId);
  if (!resolved) {
    return NextResponse.json(
      { error: "Клієнт не знайдений або без code1C" },
      { status: 404 },
    );
  }
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null && !myCodes.includes(resolved.code1C)) {
    return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
  }

  const result = await closeClosuresViaOnec({
    idempotencyKey,
    clientCode1C: resolved.code1C,
    items,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.errorMessage ?? "1С повернув помилку" },
      { status: 502 },
    );
  }

  // Side-effect 1: створити Order у нашій DB якщо 1С повернув новий orderUid
  // ТА у нас є локальний Customer (для FK). Без Customer — пропускаємо
  // (timeline-event все одно пишемо щоб операція не загубилась).
  let localOrderId: string | null = null;
  if (result.newOrderUid && result.newOrderNumber && resolved.customerId) {
    try {
      const created = await createOrderWithItems(
        {
          customerId: resolved.customerId,
          items: items.map((i) => ({
            // Без локального лукапу productId — створюємо placeholder-rows
            // якщо немає мепінгу на наш Product. Для повноцінного create-flow
            // (з реальними Product/Lot) потрібен окремий resolver (TODO).
            productId: i.productUid,
            weight: 0,
            quantity: i.quantity,
            priceEur: i.price,
          })),
          notes: `Створено через закриття старих замовлень (${result.newOrderNumber})`,
        },
        { id: resolved.customerId, code1C: resolved.code1C, name: "" },
        { userId: user.id },
      );
      localOrderId = created.id;
    } catch (e: unknown) {
      // Найчастіша причина — productUid не існує у нашій DB (1С UID не
      // мапиться). Це не ламає головну операцію (1С уже створив замовлення):
      // лишаємо `localOrderId=null`, UI відкриє external-посилання.
      console.warn(
        "[L-TEX] closures: не вдалось створити локальний Order (NEW)",
        {
          newOrderNumber: result.newOrderNumber,
          error: e instanceof Error ? e.message : String(e),
        },
      );
    }
  }

  // Side-effect 2: запис у timeline клієнта.
  recordClientEventSafe({
    clientId: resolved.mgrClientId,
    kind: "close_orders",
    body: result.newOrderNumber
      ? `Закрито ${result.closedCount} замовлень, створено нове ${result.newOrderNumber}`
      : `Закрито ${result.closedCount} замовлень`,
    authorUserId: user.id,
    metadata: {
      idempotencyKey,
      closedCount: result.closedCount,
      newOrderNumber: result.newOrderNumber,
      newOrderUid: result.newOrderUid,
      localOrderId,
    },
  });

  return NextResponse.json({
    ok: true,
    closedCount: result.closedCount,
    newOrderUid: result.newOrderUid,
    newOrderNumber: result.newOrderNumber,
    alreadyProcessed: result.alreadyProcessed,
    localOrderId,
  });
}
