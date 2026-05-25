import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  computeRouteSheetCounters,
  computeRouteSheetShortage,
  getRouteSheetLoadingRows,
} from "@/lib/manager/route-sheet-loading";
import { getRouteSheetDocuments } from "@/lib/manager/route-sheet-documents";
import {
  RouteSheetForm,
  type ExpeditorOption,
  type RouteOption,
  type RouteSheetItemView,
  type RouteSheetOrderView,
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
    select: { code1C: true, docNumber: true },
  });
  const num = sheet?.code1C ?? sheet?.docNumber;
  return {
    title: num
      ? `Маршрутний лист №${num} — L-TEX Manager`
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
      orders: true,
      items: true,
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

  const [orders, customers, products, lots, routeRows, expeditorRows] =
    await Promise.all([
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
      prisma.mgrRoute.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      }),
    ]);

  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const productMap = new Map(products.map((p) => [p.id, p]));
  const lotMap = new Map(lots.map((l) => [l.id, l]));

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

  const displayNumber = sheet.code1C ?? String(sheet.docNumber);

  // Етап 2: Загрузка (резолвлені рядки) + Бракує + лічильники (обчислювані).
  // Етап 3: Реалізації / Продажи / Оплати — derived із зворотних посилань.
  const [loading, shortage, counters, documents] = await Promise.all([
    getRouteSheetLoadingRows(sheet.id),
    computeRouteSheetShortage(sheet.id),
    computeRouteSheetCounters(sheet.id),
    getRouteSheetDocuments(sheet.id),
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
    orders: orderViews,
    items: itemViews,
    loading,
    shortage,
    counters,
    sales: documents.sales,
    saleItems: documents.saleItems,
    payments: documents.payments,
  };

  const routes: RouteOption[] = routeRows.map((r) => ({
    id: r.id,
    name: r.name,
  }));
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

      <header>
        <h1 className="text-2xl font-bold text-gray-800">
          Маршрутний лист №{displayNumber}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Створено: {new Date(sheet.createdAt).toLocaleString("uk-UA")}
        </p>
      </header>

      <RouteSheetForm
        initial={initial}
        routes={routes}
        expeditors={expeditors}
      />
    </div>
  );
}
