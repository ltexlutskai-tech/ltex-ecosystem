import { Prisma, prisma } from "@ltex/db";

/**
 * Крос-фазова інтеграція: при проведенні реалізації (`status=posted`) пишемо
 * рухи у три регістри управлінського обліку так само, як це робить проведення
 * документа в 1С:
 *  - `StockMovement` — розхід зі складу (`recordKind = 1`);
 *  - `SalesMovement` — продаж/виручка (`recordKind = 0`);
 *  - `CostMovement`  — собівартість рядка.
 *
 * Дзеркалить патерн `stock-movement-hooks.ts` + `debt-register.ts`:
 *  - чистий білдер рядків (`buildSaleMovementRows`) + fire-and-forget writer;
 *  - best-effort: НІКОЛИ не валить проведення (лише `console.warn`);
 *  - ідемпотентно через delete-then-create за реєстратором.
 *
 * **Ключ реєстратора:** `sale.code1C ?? sale.id`. Нові реалізації мають
 * `code1C = null` → використовуємо `sale.id` (cuid); історичні (з 1С-імпорту)
 * мають hex-`code1C` — вони не конфліктують з новими.
 *
 * **Одиниці (важливо для узгодженості з виручкою):** у цьому проєкті
 * `SaleItem.weight` зберігає **сумарну вагу рядка** (кількість мішків уже
 * «вбудована» через `bagWeightForQuantity`/вагу лота), а `SaleItem.priceEur` =
 * `pricePerKg × weight` (сумарна ціна рядка). Тому ми НЕ множимо вагу/собівартість
 * додатково на `quantity` (це подвоїло б значення) — беремо `item.weight` як
 * сумарну вагу, а `item.quantity` пишемо лише в `qty` (кількість мішків/одиниць).
 * Так виручка (`priceEur = pricePerKg × weight`) і собівартість
 * (`costPerKg × weight`) лежать на одній базі → маржа рахується коректно.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Один рядок реалізації, підготовлений для побудови рухів. */
export interface SaleMovementItem {
  id: string;
  productId: string | null;
  lotId: string | null;
  barcode: string | null;
  /** Сумарна вага рядка, кг (мішки вже враховані). */
  weight: number;
  /** Кількість мішків/одиниць. */
  quantity: number;
  /** Сумарна ціна рядка, EUR (= pricePerKg × weight). */
  priceEur: number;
  productCode1C: string | null;
  /** `Product.priceUnit` — "kg" пише weightKg; штучний/парний → null. */
  priceUnit: string;
  /** €/кг закупівлі конкретного лота (пріоритет для собівартості). */
  lotPurchasePriceEur: number | null;
}

/** Реалізація, завантажена для побудови рухів. */
export interface SaleMovementDoc {
  id: string;
  code1C: string | null;
  occurredAt: Date;
  clientCode1C: string | null;
  agentCode1C: string | null;
  items: SaleMovementItem[];
}

/** Результат чистого білдера — рядки для трьох регістрів + ключ реєстратора. */
export interface SaleMovementRows {
  recorder: string;
  stock: Prisma.StockMovementCreateManyInput[];
  sales: Prisma.SalesMovementCreateManyInput[];
  cost: Prisma.CostMovementCreateManyInput[];
}

/**
 * Резолвить `productCode1C` рядка: Product.code1C → barcode →
 * синтетичний ключ за id рядка (щоб рух завжди записався).
 */
function resolveProductCode(item: SaleMovementItem): string {
  return item.productCode1C || item.barcode || `sale-item:${item.id}`;
}

/**
 * Собівартість €/кг рядка: lot.purchasePriceEur → остання закупівельна ціна
 * товару (з `costByProductId`) → 0.
 */
function costPerKgFor(
  item: SaleMovementItem,
  costByProductId: Map<string, number>,
): number {
  if (item.lotPurchasePriceEur != null) return item.lotPurchasePriceEur;
  if (item.productId) {
    const c = costByProductId.get(item.productId);
    if (c != null) return c;
  }
  return 0;
}

/**
 * Чистий core (без I/O): будує рядки трьох регістрів для проведеної реалізації.
 * `costByProductId` — резолвлена батчем остання закупівельна ціна €/кг для
 * товарів без `lot.purchasePriceEur`.
 */
export function buildSaleMovementRows(
  doc: SaleMovementDoc,
  costByProductId: Map<string, number>,
): SaleMovementRows {
  const recorder = doc.code1C ?? doc.id;

  const stock: Prisma.StockMovementCreateManyInput[] = [];
  const sales: Prisma.SalesMovementCreateManyInput[] = [];
  const cost: Prisma.CostMovementCreateManyInput[] = [];

  doc.items.forEach((item, idx) => {
    const lineNo = idx + 1;
    const productCode1C = resolveProductCode(item);
    const qty = round3(item.quantity);
    const weightKg = item.priceUnit === "kg" ? round3(item.weight) : null;
    const revenueEur = round2(item.priceEur);
    const costPerKg = costPerKgFor(item, costByProductId);
    const costEur = round2(costPerKg * item.weight);
    const lotCode1C = item.barcode ?? null;

    stock.push({
      occurredAt: doc.occurredAt,
      recorderCode1C: recorder,
      lineNo,
      warehouseCode1C: null,
      productCode1C,
      productId: item.productId,
      lotCode1C,
      quality: null,
      qty,
      weightKg,
      recordKind: 1,
    });

    sales.push({
      occurredAt: doc.occurredAt,
      recorderCode1C: recorder,
      lineNo,
      productCode1C,
      productId: item.productId,
      lotCode1C,
      clientCode1C: doc.clientCode1C,
      agentCode1C: doc.agentCode1C,
      orderCode1C: null,
      saleCode1C: recorder,
      qty,
      weightKg,
      revenueEur,
      revenueNoDiscountEur: revenueEur,
      costEur: null,
      recordKind: 0,
    });

    cost.push({
      recorderCode1C: recorder,
      lineNo,
      productCode1C,
      productId: item.productId,
      qty,
      costEur,
      occurredAt: doc.occurredAt,
    });
  });

  return { recorder, stock, sales, cost };
}

/**
 * Батч-резолв останньої закупівельної ціни €/кг для товарів без
 * `lot.purchasePriceEur`. Один запит по `PurchasePrice` (orderBy validFrom desc),
 * перший запис на кожен `productId` = найновіший.
 */
async function resolveCostByProductId(
  productIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (productIds.length === 0) return map;
  const prices = await prisma.purchasePrice.findMany({
    where: { productId: { in: productIds } },
    orderBy: { validFrom: "desc" },
    select: { productId: true, priceEur: true },
  });
  for (const p of prices) {
    if (!map.has(p.productId)) map.set(p.productId, p.priceEur);
  }
  return map;
}

/**
 * Пише рухи `StockMovement` (розхід) + `SalesMovement` (продаж) +
 * `CostMovement` (собівартість) для проведеної реалізації. Fire-and-forget,
 * best-effort — ніколи не кидає (логує warn).
 *
 * delete-then-create за реєстратором: при повторному проведенні/редагуванні
 * (рядки `SaleItem` замінюються повністю) стара пачка рухів прибирається й
 * пишеться нова — без stale-рядків і без дублікатів.
 */
export function applySaleMovements(saleId: string): void {
  void (async () => {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        code1C: true,
        createdAt: true,
        assignedAgentUserId: true,
        customer: { select: { code1C: true } },
        items: {
          select: {
            id: true,
            productId: true,
            lotId: true,
            barcode: true,
            weight: true,
            quantity: true,
            priceEur: true,
            product: { select: { code1C: true, priceUnit: true } },
            lot: { select: { purchasePriceEur: true } },
          },
        },
      },
    });
    if (!sale || sale.items.length === 0) return;

    // Резолв торгового агента реалізації → User.code1C (для SalesMovement).
    let agentCode1C: string | null = null;
    if (sale.assignedAgentUserId) {
      const agent = await prisma.user.findUnique({
        where: { id: sale.assignedAgentUserId },
        select: { code1C: true },
      });
      agentCode1C = agent?.code1C ?? null;
    }

    const items: SaleMovementItem[] = sale.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      lotId: it.lotId,
      barcode: it.barcode,
      weight: it.weight,
      quantity: it.quantity,
      priceEur: it.priceEur,
      productCode1C: it.product?.code1C ?? null,
      priceUnit: it.product?.priceUnit ?? "kg",
      lotPurchasePriceEur: it.lot?.purchasePriceEur ?? null,
    }));

    // Батч-резолв собівартості для рядків без lot.purchasePriceEur.
    const productIdsNeedingCost = [
      ...new Set(
        items
          .filter((i) => i.lotPurchasePriceEur == null && i.productId)
          .map((i) => i.productId as string),
      ),
    ];
    const costByProductId = await resolveCostByProductId(productIdsNeedingCost);

    const doc: SaleMovementDoc = {
      id: sale.id,
      code1C: sale.code1C,
      occurredAt: sale.createdAt,
      clientCode1C: sale.customer?.code1C ?? null,
      agentCode1C,
      items,
    };

    const { recorder, stock, sales, cost } = buildSaleMovementRows(
      doc,
      costByProductId,
    );
    if (stock.length === 0) return;

    await prisma.$transaction([
      prisma.stockMovement.deleteMany({
        where: { recorderCode1C: recorder },
      }),
      prisma.salesMovement.deleteMany({
        where: { recorderCode1C: recorder },
      }),
      prisma.costMovement.deleteMany({
        where: { recorderCode1C: recorder },
      }),
      prisma.stockMovement.createMany({ data: stock }),
      prisma.salesMovement.createMany({ data: sales }),
      prisma.costMovement.createMany({ data: cost }),
    ]);
  })().catch((e: unknown) => {
    console.warn("[L-TEX] Failed to apply sale movements", {
      saleId,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}

/**
 * Прибирає рухи реалізації з усіх трьох регістрів (при видаленні документа).
 * Приймає `recorder` (= `sale.code1C ?? sale.id`), обчислений до видалення.
 * Fire-and-forget, best-effort.
 */
export function removeSaleMovements(recorder: string): void {
  void (async () => {
    await prisma.$transaction([
      prisma.stockMovement.deleteMany({
        where: { recorderCode1C: recorder },
      }),
      prisma.salesMovement.deleteMany({
        where: { recorderCode1C: recorder },
      }),
      prisma.costMovement.deleteMany({
        where: { recorderCode1C: recorder },
      }),
    ]);
  })().catch((e: unknown) => {
    console.warn("[L-TEX] Failed to remove sale movements", {
      recorder,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}
