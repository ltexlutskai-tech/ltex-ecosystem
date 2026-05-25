import { prisma } from "@ltex/db";

/**
 * Блок «Маршрутний лист» — Етап 3. Вкладки Реалізації / Продажи / Оплати.
 *
 * **DERIVED, не dual-write.** Вкладки обчислюються із зворотних посилань:
 *  • Реалізації — `Sale` де `routeSheetId == sheet.id` (1С таб. частина
 *    `Реализации`);
 *  • Продажи    — `SaleItem` тих реалізацій (1С `Продажи`, порядкова деталізація);
 *  • Оплати     — `MgrCashOrder` де `routeSheetId == sheet.id` (1С `Оплаты`).
 *
 * Таблиці `RouteSheetSale`/`RouteSheetSaleItem`/`RouteSheetPayment` у цьому етапі
 * **НЕ ведуться** (лишаються порожні, зарезервовані під payload обміну Етапу 5) —
 * як 1С відновлює Оплати на сервері з пов'язаних ПКО/РКО (аудит §H, `:5582`),
 * а не з окремої таблиці.
 *
 * Cross-model id-поля у `SaleItem` (productId/lotId) — плоскі скаляри; імена
 * резолвимо batch-lookup-ами (той самий патерн, що Заказы/Товари у [id] GET).
 */

/** Рядок вкладки «Реалізації» (підсумок по документу). */
export interface RouteSheetSaleView {
  id: string;
  docNumber: number;
  code1C: string | null;
  status: string;
  customerId: string;
  customerName: string | null;
  /** Замовлення-підстава (`Sale.orderId`) — для анти-дублю + контексту. */
  orderId: string | null;
  totalEur: number;
  totalUah: number;
}

/** Рядок вкладки «Продажи» (порядкова деталізація проданого). */
export interface RouteSheetSaleItemView {
  id: string;
  saleId: string;
  saleNumber: number;
  customerName: string | null;
  productId: string;
  productName: string | null;
  articleCode: string | null;
  lotId: string | null;
  barcode: string | null;
  quantity: number;
  weight: number;
  pricePerKg: number;
  priceEur: number;
}

/** Рядок вкладки «Оплати» (касовий ордер). */
export interface RouteSheetPaymentView {
  id: string;
  docNumber: number;
  /** income | expense (Приход/Розхід). */
  type: string;
  customerId: string | null;
  customerName: string | null;
  saleId: string | null;
  /** Зведена сума ордера у EUR (СуммаДокумента). */
  documentSumEur: number;
}

export interface RouteSheetDocuments {
  sales: RouteSheetSaleView[];
  saleItems: RouteSheetSaleItemView[];
  payments: RouteSheetPaymentView[];
}

/**
 * Обчислює датасети трьох вкладок (Реалізації / Продажи / Оплати) із зворотних
 * посилань `routeSheetId`. Один прохід: тягне Sale + items + customer, окремо —
 * MgrCashOrder, далі один batch-резолв імен товарів/лотів для Продажи.
 */
export async function getRouteSheetDocuments(
  routeSheetId: string,
): Promise<RouteSheetDocuments> {
  const [saleRows, paymentRows] = await Promise.all([
    prisma.sale.findMany({
      where: { routeSheetId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        docNumber: true,
        code1C: true,
        status: true,
        orderId: true,
        totalEur: true,
        totalUah: true,
        customer: { select: { id: true, name: true } },
        items: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            productId: true,
            lotId: true,
            barcode: true,
            quantity: true,
            weight: true,
            pricePerKg: true,
            priceEur: true,
          },
        },
      },
    }),
    prisma.mgrCashOrder.findMany({
      where: { routeSheetId },
      orderBy: { paidAt: "asc" },
      select: {
        id: true,
        docNumber: true,
        type: true,
        saleId: true,
        documentSumEur: true,
        customer: { select: { id: true, name: true } },
        sale: { select: { customer: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  const sales: RouteSheetSaleView[] = saleRows.map((s) => ({
    id: s.id,
    docNumber: s.docNumber,
    code1C: s.code1C,
    status: s.status,
    customerId: s.customer.id,
    customerName: s.customer.name,
    orderId: s.orderId,
    totalEur: s.totalEur,
    totalUah: s.totalUah,
  }));

  // ─── Продажи: рядки реалізацій + batch-резолв імен товарів/лотів ──────────
  const productIds = new Set<string>();
  const lotIds = new Set<string>();
  for (const s of saleRows) {
    for (const it of s.items) {
      productIds.add(it.productId);
      if (it.lotId) lotIds.add(it.lotId);
    }
  }

  const [products, lots] = await Promise.all([
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
  const productMap = new Map(products.map((p) => [p.id, p]));
  const lotMap = new Map(lots.map((l) => [l.id, l]));

  const saleItems: RouteSheetSaleItemView[] = [];
  for (const s of saleRows) {
    for (const it of s.items) {
      const product = productMap.get(it.productId);
      const lot = it.lotId ? lotMap.get(it.lotId) : null;
      saleItems.push({
        id: it.id,
        saleId: s.id,
        saleNumber: s.docNumber,
        customerName: s.customer.name,
        productId: it.productId,
        productName: product?.name ?? null,
        articleCode: product?.articleCode ?? null,
        lotId: it.lotId,
        barcode: lot?.barcode ?? it.barcode ?? null,
        quantity: it.quantity,
        weight: it.weight,
        pricePerKg: it.pricePerKg,
        priceEur: it.priceEur,
      });
    }
  }

  const payments: RouteSheetPaymentView[] = paymentRows.map((o) => {
    const customer = o.customer ?? o.sale?.customer ?? null;
    return {
      id: o.id,
      docNumber: o.docNumber,
      type: o.type,
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? null,
      saleId: o.saleId,
      documentSumEur: o.documentSumEur,
    };
  });

  return { sales, saleItems, payments };
}
