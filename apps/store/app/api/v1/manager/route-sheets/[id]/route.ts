import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canDeleteManagerDoc } from "@/lib/manager/doc-delete-permission";
import {
  canTransition,
  isRouteSheetLocked,
} from "@/lib/manager/route-sheet-status";
import {
  computeRouteSheetCounters,
  computeRouteSheetShortage,
  getRouteSheetLoadingRows,
} from "@/lib/manager/route-sheet-loading";
import {
  getRouteSheetDocuments,
  getRouteSheetExpenses,
} from "@/lib/manager/route-sheet-documents";
import { getUnclosedMileageWarning } from "@/lib/manager/route-sheet-mileage";
import {
  dispatchRouteSheetLots,
  markRouteSheetOrdersInactive,
  returnRouteSheetLotsToStock,
  settleRouteSheetTransit,
} from "@/lib/manager/route-sheet-actions";
import {
  applyCompleteTransitSafe,
  applyDispatchTransitSafe,
} from "@/lib/manager/route-sheet-transit";
import {
  applyRouteSheetExpensesSafe,
  rebuildMileageExpenseSafe,
} from "@/lib/manager/route-sheet-expenses";
import { updateRouteSheetSchema } from "@/lib/validations/manager-route-sheet";

/**
 * GET — повний маршрутний лист: шапка + Заказы + Товари (Етап 1) + Загрузка +
 * Бракує + лічильники (Етап 2).
 *
 * Cross-model id-поля у дочірніх таблицях (orderId/customerId/productId/lotId)
 * — **плоскі скаляри без Prisma-relation**. Імена резолвимо batch-lookup-ами:
 * збираємо всі id → один findMany на модель → мапимо у dictionary.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const sheet = await prisma.routeSheet.findUnique({
    where: { id },
    include: {
      route: { select: { id: true, name: true } },
      expeditor: { select: { id: true, fullName: true } },
      orders: true,
      items: true,
      tasks: true,
    },
  });
  if (!sheet) {
    return NextResponse.json(
      { error: "Маршрутний лист не знайдено" },
      { status: 404 },
    );
  }

  // ─── Batch-resolve cross-model names ──────────────────────────────────────
  const orderIds = new Set<string>();
  const customerIds = new Set<string>();
  const productIds = new Set<string>();
  const lotIds = new Set<string>();
  for (const o of sheet.orders) {
    orderIds.add(o.orderId);
    if (o.customerId) customerIds.add(o.customerId);
  }
  for (const it of sheet.items) {
    if (it.orderId) orderIds.add(it.orderId);
    if (it.customerId) customerIds.add(it.customerId);
    productIds.add(it.productId);
    if (it.lotId) lotIds.add(it.lotId);
  }
  // Завдання — вільні нотатки; клієнт обирається з менеджерського довідника
  // (MgrClient), тому імена резолвимо окремим batch-lookup-ом нижче.
  const taskClientIds = new Set<string>();
  for (const t of sheet.tasks) {
    if (t.customerId) taskClientIds.add(t.customerId);
  }

  const [orders, customers, products, lots] = await Promise.all([
    orderIds.size > 0
      ? prisma.order.findMany({
          where: { id: { in: [...orderIds] } },
          select: { id: true, code1C: true },
        })
      : Promise.resolve([]),
    customerIds.size > 0
      ? prisma.customer.findMany({
          where: { id: { in: [...customerIds] } },
          select: { id: true, name: true, city: true, code1C: true },
        })
      : Promise.resolve([]),
    productIds.size > 0
      ? prisma.product.findMany({
          where: { id: { in: [...productIds] } },
          select: { id: true, name: true, articleCode: true },
        })
      : Promise.resolve([]),
    lotIds.size > 0
      ? prisma.lot.findMany({
          where: { id: { in: [...lotIds] } },
          select: { id: true, barcode: true },
        })
      : Promise.resolve([]),
  ]);

  const taskClients =
    taskClientIds.size > 0
      ? await prisma.mgrClient.findMany({
          where: { id: { in: [...taskClientIds] } },
          select: { id: true, name: true },
        })
      : [];

  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const productMap = new Map(products.map((p) => [p.id, p]));
  const lotMap = new Map(lots.map((l) => [l.id, l]));
  const taskClientMap = new Map(taskClients.map((c) => [c.id, c]));

  // Етап 2: Загрузка + Бракує + лічильники (обчислювані / резолвлені окремо).
  // Етап 3: Реалізації / Продажи / Оплати — derived із зворотних посилань.
  // Етап 4: попередження про незакритий кілометраж попередньої зміни (м'яке).
  const [loading, shortage, counters, documents, expenses, mileageWarning] =
    await Promise.all([
      getRouteSheetLoadingRows(sheet.id),
      computeRouteSheetShortage(sheet.id),
      computeRouteSheetCounters(sheet.id),
      getRouteSheetDocuments(sheet.id),
      getRouteSheetExpenses(sheet.id),
      getUnclosedMileageWarning(sheet.expeditorUserId, sheet.id),
    ]);

  return NextResponse.json({
    sheet: {
      id: sheet.id,
      code1C: sheet.code1C,
      docNumber: sheet.docNumber,
      date: sheet.date.toISOString(),
      arrivalDate: sheet.arrivalDate ? sheet.arrivalDate.toISOString() : null,
      status: sheet.status,
      routeId: sheet.routeId,
      expeditorUserId: sheet.expeditorUserId,
      comment: sheet.comment,
      totalEur: sheet.totalEur,
      totalUah: sheet.totalUah,
      mileageStartKm: sheet.mileageStartKm,
      mileageEndKm: sheet.mileageEndKm,
      pricePerKm: sheet.pricePerKm,
      gpsLat: sheet.gpsLat,
      gpsLng: sheet.gpsLng,
      mileageWarning,
      archived: sheet.archived,
      route: sheet.route,
      expeditor: sheet.expeditor,
      createdAt: sheet.createdAt.toISOString(),
      updatedAt: sheet.updatedAt.toISOString(),
      orders: sheet.orders.map((o) => {
        const order = orderMap.get(o.orderId);
        const customer = o.customerId ? customerMap.get(o.customerId) : null;
        return {
          id: o.id,
          orderId: o.orderId,
          orderNumber: order?.code1C ?? null,
          customerId: o.customerId,
          customerName: customer?.name ?? null,
          city: o.city ?? customer?.city ?? null,
        };
      }),
      items: sheet.items.map((it) => {
        const product = productMap.get(it.productId);
        const customer = it.customerId ? customerMap.get(it.customerId) : null;
        const order = it.orderId ? orderMap.get(it.orderId) : null;
        const lot = it.lotId ? lotMap.get(it.lotId) : null;
        return {
          id: it.id,
          orderId: it.orderId,
          orderNumber: order?.code1C ?? null,
          customerId: it.customerId,
          customerName: customer?.name ?? null,
          productId: it.productId,
          productName: product?.name ?? null,
          articleCode: product?.articleCode ?? null,
          lotId: it.lotId,
          barcode: lot?.barcode ?? null,
          unit: it.unit,
          quantity: it.quantity,
          price: it.price,
          sum: it.sum,
          quantityLoaded: it.quantityLoaded,
        };
      }),
      loading,
      shortage,
      counters,
      sales: documents.sales,
      saleItems: documents.saleItems,
      payments: documents.payments,
      expenses,
      tasks: sheet.tasks.map((t) => {
        const client = t.customerId ? taskClientMap.get(t.customerId) : null;
        return {
          id: t.id,
          customerId: t.customerId,
          customerName: client?.name ?? null,
          comment: t.comment,
        };
      }),
    },
  });
}

/** Поля, що не можна редагувати у завершеного (completed) МЛ — крім статусу. */
const NON_STATUS_FIELDS = [
  "date",
  "arrivalDate",
  "routeId",
  "expeditorUserId",
  "comment",
  "mileageStartKm",
  "mileageEndKm",
  "pricePerKm",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.routeSheet.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Маршрутний лист не знайдено" },
      { status: 404 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = updateRouteSheetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Зміна статусу — перевірка графа переходів (нелегальний стрибок → 400).
  // Сам перехід дозволено навіть на completed-листі (можна розблокувати).
  if (input.status !== undefined && input.status !== existing.status) {
    if (!canTransition(existing.status, input.status)) {
      return NextResponse.json(
        {
          error: `Неможливий перехід статусу: ${existing.status} → ${input.status}`,
        },
        { status: 400 },
      );
    }
  }

  // Завершений (completed) МЛ заблоковано для редагування non-status полів.
  // Зміна самого статусу (наприклад розблокування) — дозволена.
  if (isRouteSheetLocked(existing.status)) {
    const touchesNonStatus = NON_STATUS_FIELDS.some(
      (f) => input[f] !== undefined,
    );
    if (touchesNonStatus) {
      return NextResponse.json(
        { error: "Маршрутний лист завершено — редагування заборонено" },
        { status: 409 },
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (input.date !== undefined) data.date = new Date(input.date);
  if (input.arrivalDate !== undefined) {
    data.arrivalDate = input.arrivalDate ? new Date(input.arrivalDate) : null;
  }
  if (input.routeId !== undefined) data.routeId = input.routeId;
  if (input.expeditorUserId !== undefined) {
    data.expeditorUserId = input.expeditorUserId;
  }
  if (input.status !== undefined) data.status = input.status;
  if (input.comment !== undefined) data.comment = input.comment;
  if (input.mileageStartKm !== undefined) {
    data.mileageStartKm = input.mileageStartKm;
  }
  if (input.mileageEndKm !== undefined) data.mileageEndKm = input.mileageEndKm;
  if (input.pricePerKm !== undefined) data.pricePerKm = input.pricePerKm;
  // GPS — best-effort знімок (надсилається разом зі статус-переходом). Не у
  // NON_STATUS_FIELDS, тому captured-координати дозволено й на completed-листі.
  if (input.gpsLat !== undefined) data.gpsLat = input.gpsLat;
  if (input.gpsLng !== undefined) data.gpsLng = input.gpsLng;

  // Чи це значущий статус-перехід у виїзд / завершення дня?
  const statusChanged =
    input.status !== undefined && input.status !== existing.status;
  const newStatus = input.status;
  const triggersSideEffects =
    statusChanged && (newStatus === "dispatched" || newStatus === "completed");

  // Транзакція: оновлюємо шапку + (на статус-переходах) дзеркалимо 1С.
  //  - dispatched: завантажені лоти → in_transit (товар у дорозі) + замовлення
  //    неактуальні;
  //  - completed: лоти розводяться на sold (продані) / free (повернені на склад).
  const sheet = await prisma.$transaction(async (tx) => {
    const updated = await tx.routeSheet.update({ where: { id }, data });
    if (statusChanged && newStatus === "dispatched") {
      await dispatchRouteSheetLots(tx, id);
      await markRouteSheetOrdersInactive(tx, id);
    } else if (statusChanged && newStatus === "completed") {
      await settleRouteSheetTransit(tx, id);
    } else if (statusChanged && newStatus === "draft") {
      await returnRouteSheetLotsToStock(tx, id);
    }
    return updated;
  });

  // Блок А: рухи регістру «товар у дорозі» + складу (best-effort, після коміту).
  if (statusChanged && newStatus === "dispatched") {
    applyDispatchTransitSafe(id);
  } else if (statusChanged && newStatus === "completed") {
    applyCompleteTransitSafe(id);
  }

  // Блок Б: перебудувати авто-рядок витрат «Пальне/пробіг» під новий кілометраж/
  // ціну за км (best-effort, після коміту).
  if (
    input.mileageStartKm !== undefined ||
    input.mileageEndKm !== undefined ||
    input.pricePerKm !== undefined
  ) {
    rebuildMileageExpenseSafe(id);
  }
  // Блок Б: при завершенні МЛ — рухи каси (розхід) по витратах маршруту.
  if (triggersSideEffects && newStatus === "completed") {
    applyRouteSheetExpensesSafe(id);
  }

  return NextResponse.json({
    id: sheet.id,
    code1C: sheet.code1C,
    docNumber: sheet.docNumber,
    date: sheet.date.toISOString(),
    arrivalDate: sheet.arrivalDate ? sheet.arrivalDate.toISOString() : null,
    status: sheet.status,
    routeId: sheet.routeId,
    expeditorUserId: sheet.expeditorUserId,
    comment: sheet.comment,
    mileageStartKm: sheet.mileageStartKm,
    mileageEndKm: sheet.mileageEndKm,
    gpsLat: sheet.gpsLat,
    gpsLng: sheet.gpsLng,
    totalEur: sheet.totalEur,
    totalUah: sheet.totalUah,
    updatedAt: sheet.updatedAt.toISOString(),
  });
}

/**
 * Видалення маршрутного листа (з контекстного меню списку).
 *
 * Маршрутні листи спільні (не прив'язані до клієнта), як GET/PATCH — без
 * per-client ownership; обмежуємо лише роллю (`canDeleteManagerDoc`).
 *
 * Реверс сліду документа в одній транзакції:
 *   - ВСІ власні дочірні таблиці МЛ (orders/items/loading/sales/saleItems/
 *     payments/tasks/expenses) видаляються каскадом (`onDelete: Cascade`);
 *   - РЕАЛЬНІ документи Sale / MgrCashOrder / Order НЕ видаляються — вони
 *     посилаються на МЛ через плоский скаляр `routeSheetId` (без FK), тож просто
 *     обнуляємо це посилання, щоб не лишилось «висячих» зв'язків.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  if (!canDeleteManagerDoc(user.role)) {
    return NextResponse.json(
      { error: "Недостатньо прав для видалення" },
      { status: 403 },
    );
  }

  const { id } = await params;

  const existing = await prisma.routeSheet.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Маршрутний лист не знайдено" },
      { status: 404 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Відв'язуємо реальні документи (routeSheetId — плоский скаляр, не FK).
      await tx.sale.updateMany({
        where: { routeSheetId: id },
        data: { routeSheetId: null },
      });
      await tx.mgrCashOrder.updateMany({
        where: { routeSheetId: id },
        data: { routeSheetId: null },
      });
      await tx.order.updateMany({
        where: { routeSheetId: id },
        data: { routeSheetId: null },
      });
      // Власні дочірні таблиці МЛ зникають каскадом разом з шапкою.
      await tx.routeSheet.delete({ where: { id } });
    });

    revalidatePath("/manager/routes");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[L-TEX] Route sheet delete failed", {
      routeSheetId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка видалення маршрутного листа" },
      { status: 500 },
    );
  }
}
