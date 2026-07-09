import { prisma } from "@ltex/db";

/**
 * Блок «Маршрут», доробка А — рухи регістру «товар у дорозі» (`TransitMovement`,
 * 1С ТоварыВДороге) + складу (`StockMovement`) при відправці/завершенні МЛ.
 *
 * Модель (дзеркалить центральну 1С):
 *   • **Відправка** (dispatched): кожен завантажений лот
 *       – склад: розхід (лот залишає склад) → StockMovement recordKind=1;
 *       – дорога: прихід (лот у машині) → TransitMovement recordKind=0.
 *   • **Завершення** (completed): кожен лот, що був у дорозі
 *       – дорога: розхід (лот вибуває з дороги) → TransitMovement recordKind=1;
 *       – повернені (не продані) лоти: склад прихід (назад на склад) →
 *         StockMovement recordKind=0.
 *
 * Ключ реєстратора = локальний `RouteSheet.id`, lineNo по рядках завантаження.
 * StockMovement від продажу маршрутних реалізацій НЕ пишеться (Блок В його
 * свідомо пропускає для routeSheetId) — тут єдине джерело складських рухів МЛ.
 *
 * Best-effort ПІСЛЯ коміту: НІКОЛИ не валить статус-перехід. Пропускає
 * імпортовані з 1С МЛ (мають code1C — рухи вже з імпорту).
 */

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

interface LoadingLine {
  lotId: string;
  barcode: string;
  productId: string;
  customerId: string | null;
  quantity: number;
  weight: number;
  isReturn: boolean;
}

/** Завантажує рядки Загрузки + мапу productId→code1C + клієнтські code1C. */
async function loadContext(routeSheetId: string): Promise<{
  code1C: string | null;
  occurredAt: Date;
  rows: LoadingLine[];
  productCodeById: Map<string, string>;
  clientCodeById: Map<string, string>;
} | null> {
  const sheet = await prisma.routeSheet.findUnique({
    where: { id: routeSheetId },
    select: { id: true, code1C: true, date: true },
  });
  if (!sheet) return null;

  const rows = await prisma.routeSheetLoading.findMany({
    where: { routeSheetId },
    select: {
      lotId: true,
      barcode: true,
      productId: true,
      customerId: true,
      quantity: true,
      weight: true,
      isReturn: true,
    },
  });

  const productIds = [...new Set(rows.map((r) => r.productId))];
  const customerIds = [
    ...new Set(rows.map((r) => r.customerId).filter((v): v is string => !!v)),
  ];
  const [products, customers] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({
          where: { id: { in: productIds }, code1C: { not: null } },
          select: { id: true, code1C: true },
        })
      : Promise.resolve([]),
    customerIds.length
      ? prisma.customer.findMany({
          where: { id: { in: customerIds }, code1C: { not: null } },
          select: { id: true, code1C: true },
        })
      : Promise.resolve([]),
  ]);

  const productCodeById = new Map<string, string>();
  for (const p of products) if (p.code1C) productCodeById.set(p.id, p.code1C);
  const clientCodeById = new Map<string, string>();
  for (const c of customers) if (c.code1C) clientCodeById.set(c.id, c.code1C);

  return {
    code1C: sheet.code1C,
    occurredAt: sheet.date ?? new Date(),
    rows,
    productCodeById,
    clientCodeById,
  };
}

/** productCode1C для рядка: Product.code1C → barcode → синтетичний ключ. */
function resolveProductCode(
  row: LoadingLine,
  map: Map<string, string>,
): string {
  return map.get(row.productId) || row.barcode || `rs-lot:${row.lotId}`;
}

/**
 * Відправка МЛ: рухи «склад → дорога». Для кожного завантаженого лота —
 * StockMovement розхід (склад) + TransitMovement прихід (дорога).
 */
export function applyDispatchTransitSafe(routeSheetId: string): void {
  void (async () => {
    const ctx = await loadContext(routeSheetId);
    if (!ctx || ctx.code1C || ctx.rows.length === 0) return;

    let lineNo = 0;
    for (const row of ctx.rows) {
      lineNo += 1;
      const productCode1C = resolveProductCode(row, ctx.productCodeById);
      const clientCode1C = row.customerId
        ? (ctx.clientCodeById.get(row.customerId) ?? null)
        : null;
      const qty = round3(row.quantity || 1);
      const weightKg = row.weight ? round3(row.weight) : null;

      // Склад: розхід (лот залишає склад).
      await prisma.stockMovement.upsert({
        where: {
          stock_movement_src: {
            recorderCode1C: routeSheetId,
            lineNo,
            productCode1C,
          },
        },
        create: {
          occurredAt: ctx.occurredAt,
          recorderCode1C: routeSheetId,
          lineNo,
          warehouseCode1C: null,
          productCode1C,
          productId: row.productId,
          lotCode1C: row.barcode,
          qty,
          weightKg,
          recordKind: 1,
        },
        update: { qty, weightKg, recordKind: 1 },
      });

      // Дорога: прихід (лот у машині).
      await prisma.transitMovement.upsert({
        where: {
          transit_movement_src: {
            recorderCode1C: routeSheetId,
            lineNo,
            productCode1C,
          },
        },
        create: {
          occurredAt: ctx.occurredAt,
          recorderCode1C: routeSheetId,
          lineNo,
          productCode1C,
          productId: row.productId,
          lotCode1C: row.barcode,
          lotId: row.lotId,
          clientCode1C,
          qty,
          weightKg,
          recordKind: 0,
        },
        update: { qty, weightKg, clientCode1C, recordKind: 0 },
      });
    }
  })().catch((e: unknown) => {
    console.warn("[L-TEX] Failed to apply dispatch transit movements", {
      routeSheetId,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}

/**
 * Завершення МЛ: кожен лот вибуває з дороги (TransitMovement розхід). Повернені
 * (не продані у реалізаціях цього МЛ) лоти повертаються на склад (StockMovement
 * прихід). Продані лоти зі складу вже списані при відправці — назад не додаються.
 */
export function applyCompleteTransitSafe(routeSheetId: string): void {
  void (async () => {
    const ctx = await loadContext(routeSheetId);
    if (!ctx || ctx.code1C || ctx.rows.length === 0) return;

    // Лоти, продані у реалізаціях цього маршруту.
    const soldItems = await prisma.saleItem.findMany({
      where: {
        sale: { routeSheetId },
        lotId: { in: ctx.rows.map((r) => r.lotId) },
      },
      select: { lotId: true },
    });
    const soldLotIds = new Set(
      soldItems.map((i) => i.lotId).filter((v): v is string => v != null),
    );

    // Розхід дороги пишемо з окремим діапазоном lineNo (щоб не конфліктувати з
    // приходом при відправці, який має ті самі lineNo 1..N).
    let lineNo = 1000;
    for (const row of ctx.rows) {
      lineNo += 1;
      const productCode1C = resolveProductCode(row, ctx.productCodeById);
      const clientCode1C = row.customerId
        ? (ctx.clientCodeById.get(row.customerId) ?? null)
        : null;
      const qty = round3(row.quantity || 1);
      const weightKg = row.weight ? round3(row.weight) : null;
      const returned = row.isReturn || !soldLotIds.has(row.lotId);

      // Дорога: розхід (лот вибуває з дороги).
      await prisma.transitMovement.upsert({
        where: {
          transit_movement_src: {
            recorderCode1C: routeSheetId,
            lineNo,
            productCode1C,
          },
        },
        create: {
          occurredAt: ctx.occurredAt,
          recorderCode1C: routeSheetId,
          lineNo,
          productCode1C,
          productId: row.productId,
          lotCode1C: row.barcode,
          lotId: row.lotId,
          clientCode1C,
          qty,
          weightKg,
          recordKind: 1,
        },
        update: { qty, weightKg, clientCode1C, recordKind: 1 },
      });

      // Повернені лоти: склад прихід (назад на склад).
      if (returned) {
        await prisma.stockMovement.upsert({
          where: {
            stock_movement_src: {
              recorderCode1C: routeSheetId,
              lineNo,
              productCode1C,
            },
          },
          create: {
            occurredAt: ctx.occurredAt,
            recorderCode1C: routeSheetId,
            lineNo,
            warehouseCode1C: null,
            productCode1C,
            productId: row.productId,
            lotCode1C: row.barcode,
            qty,
            weightKg,
            recordKind: 0,
          },
          update: { qty, weightKg, recordKind: 0 },
        });
      }
    }
  })().catch((e: unknown) => {
    console.warn("[L-TEX] Failed to apply complete transit movements", {
      routeSheetId,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}
