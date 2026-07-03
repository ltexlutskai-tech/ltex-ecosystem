import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/order-ownership";
import { formatOrderNumber } from "@/lib/manager/order-number";

/** Рядок огляду «незакрите замовлення × позиція» для блоку Закриття. */
interface ClosuresListItem {
  orderUid: string;
  orderNumber: string;
  orderDate: string;
  productUid: string;
  productName: string;
  quantity: number;
  sum: number;
  sold: number;
  status: string;
}

/**
 * Закриття старих замовлень — GET (локальні дані).
 *
 * 1С-SOAP скасовано (POST_1C), тому блок тепер рахує «продано vs замовлено»
 * локально через зв'язку `Sale.orderId` → `SaleItem`. READ-ONLY огляд
 * незакритих замовлень клієнта з прогресом продажів; саме закриття робиться
 * на сторінці замовлення (`/manager/orders/[id]`).
 *
 * `[clientId]` — це **MgrClient.id** (UI передає його з ClientPicker).
 * Резолвимо у `code1C` для лукапу замовлень + перевірки ownership.
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
} | null> {
  const mgr = await prisma.mgrClient.findUnique({
    where: { id: clientId },
    select: { id: true, code1C: true },
  });
  if (mgr?.code1C) {
    return { code1C: mgr.code1C, mgrClientId: mgr.id };
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

  const orders = await prisma.order.findMany({
    where: { customer: { code1C: resolved.code1C }, closedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, code1C: true } },
        },
      },
    },
  });

  // Продано per (order, product): беремо реалізації, прив'язані до цих
  // замовлень (`Sale.orderId`), і будуємо мапу `${orderId}:${productId}`.
  const orderIds = orders.map((o) => o.id);
  const soldMap = new Map<string, number>();
  if (orderIds.length > 0) {
    const sales = await prisma.sale.findMany({
      where: { orderId: { in: orderIds } },
      select: {
        orderId: true,
        items: { select: { productId: true, quantity: true } },
      },
    });
    for (const sale of sales) {
      if (!sale.orderId) continue;
      for (const item of sale.items) {
        const key = `${sale.orderId}:${item.productId}`;
        soldMap.set(key, (soldMap.get(key) ?? 0) + item.quantity);
      }
    }
  }

  const items: ClosuresListItem[] = [];
  for (const order of orders) {
    const orderNumber =
      order.number1C ?? order.code1C ?? `№${order.id.slice(0, 8)}`;
    const orderDate = order.createdAt.toISOString();
    for (const item of order.items) {
      const sold = soldMap.get(`${order.id}:${item.productId}`) ?? 0;
      items.push({
        orderUid: order.id,
        orderNumber,
        orderDate,
        productUid: item.productId,
        productName: item.product.name,
        quantity: item.quantity,
        sum: item.priceEur,
        sold,
        status: sold >= item.quantity && item.quantity > 0 ? "sold" : "open",
      });
    }
  }

  return NextResponse.json({ ok: true, items });
}

/**
 * POST — закриття через цей блок більше не підтримується.
 *
 * 1С-SOAP скасовано; закриття замовлень виконується на сторінці замовлення
 * (`/manager/orders/[id]`), де є робоча кнопка закриття.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Закриття виконується на сторінці замовлення",
    },
    { status: 501 },
  );
}
