import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Printer, Truck } from "lucide-react";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  computeLoadingBoard,
  computeRouteSheetCounters,
  computeRouteSheetShortage,
  getRouteSheetLoadingRows,
} from "@/lib/manager/route-sheet-loading";
import {
  getRouteSheetDocuments,
  getRouteSheetExpenses,
} from "@/lib/manager/route-sheet-documents";
import { getUnclosedMileageWarning } from "@/lib/manager/route-sheet-mileage";
import { formatDocNumber } from "@/lib/manager/order-number";
import {
  RouteSheetForm,
  type CashFlowArticleOption,
  type ExpeditorOption,
  type RouteSheetItemView,
  type RouteSheetOrderView,
  type RouteSheetTaskView,
  type RouteSheetView,
} from "./_components/route-sheet-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sheet = await prisma.routeSheet.findUnique({
    where: { id },
    select: { code1C: true, number1C: true, docNumber: true },
  });
  return {
    title: sheet
      ? `Маршрутний лист ${formatDocNumber(sheet)} — L-TEX Manager`
      : "Маршрутний лист — L-TEX Manager",
  };
}

export default async function ManagerRouteSheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const { id } = await params;

  const sheet = await prisma.routeSheet.findUnique({
    where: { id },
    include: {
      route: { select: { id: true, name: true } },
      expeditor: { select: { id: true, fullName: true } },
      orders: { orderBy: { position: "asc" } },
      items: true,
      tasks: true,
    },
  });
  if (!sheet) notFound();

  // ─── Batch-resolve cross-model names (плоскі скаляри, без relation) ───────
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
  // Завдання — клієнт з менеджерського довідника (MgrClient).
  const taskClientIds = new Set<string>();
  for (const t of sheet.tasks) {
    if (t.customerId) taskClientIds.add(t.customerId);
  }

  const [orders, customers, products, lots, expeditorRows] = await Promise.all([
    orderIds.size > 0
      ? prisma.order.findMany({
          where: { id: { in: [...orderIds] } },
          select: { id: true, code1C: true },
        })
      : Promise.resolve([]),
    customerIds.size > 0
      ? prisma.customer.findMany({
          where: { id: { in: [...customerIds] } },
          select: { id: true, name: true, city: true },
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
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  // Довідник статей витрат (для дропдауна у вкладці «Витрати», Блок Б).
  const cashFlowArticleRows = await prisma.mgrCashFlowArticle.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const cashFlowArticles: CashFlowArticleOption[] = cashFlowArticleRows.map(
    (a) => ({ id: a.id, name: a.name }),
  );

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

  const taskViews: RouteSheetTaskView[] = sheet.tasks.map((t) => {
    const client = t.customerId ? taskClientMap.get(t.customerId) : null;
    return {
      id: t.id,
      customerId: t.customerId,
      customerName: client?.name ?? null,
      comment: t.comment,
    };
  });

  const orderViews: RouteSheetOrderView[] = sheet.orders.map((o) => {
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
  });

  const itemViews: RouteSheetItemView[] = sheet.items.map((it) => {
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
  });

  const displayNumber = formatDocNumber(sheet);

  // Етап 2: Загрузка (резолвлені рядки) + Бракує + лічильники (обчислювані).
  // Етап 3: Реалізації / Продажи / Оплати — derived із зворотних посилань.
  const [
    loading,
    loadingBoard,
    shortage,
    counters,
    documents,
    expenses,
    mileageWarning,
  ] = await Promise.all([
    getRouteSheetLoadingRows(sheet.id),
    computeLoadingBoard(sheet.id),
    computeRouteSheetShortage(sheet.id),
    computeRouteSheetCounters(sheet.id),
    getRouteSheetDocuments(sheet.id),
    getRouteSheetExpenses(sheet.id),
    getUnclosedMileageWarning(sheet.expeditorUserId, sheet.id),
  ]);

  const initial: RouteSheetView = {
    id: sheet.id,
    displayNumber,
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
    orders: orderViews,
    items: itemViews,
    loading,
    loadingBoard,
    shortage,
    counters,
    sales: documents.sales,
    saleItems: documents.saleItems,
    payments: documents.payments,
    expenses,
    tasks: taskViews,
  };

  const expeditors: ExpeditorOption[] = expeditorRows.map((u) => ({
    id: u.id,
    fullName: u.fullName,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/manager/routes"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до списку
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Маршрутний лист {displayNumber}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Створено: {new Date(sheet.createdAt).toLocaleString("uk-UA")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/manager/routes/${id}/loading`}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Truck className="h-4 w-4" />
            Завантаження складу
          </Link>
          <Link
            href={`/manager/routes/${id}/print`}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Printer className="h-4 w-4" />
            Друк
          </Link>
        </div>
      </header>

      <RouteSheetForm
        initial={initial}
        expeditors={expeditors}
        cashFlowArticles={cashFlowArticles}
      />
    </div>
  );
}
