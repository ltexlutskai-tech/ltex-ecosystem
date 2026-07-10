import { prisma } from "@ltex/db";

/**
 * Блок «Маршрут», доробка А — рухи регістру «товар у дорозі» (`TransitMovement`,
 * 1С ТоварыВДороге) при відправці/завершенні МЛ.
 *
 * Модель:
 *   • **Відправка** (dispatched): кожен завантажений лот → дорога прихід
 *     (TransitMovement recordKind=0) — лот фізично в машині.
 *   • **Завершення** (completed): кожен лот → дорога розхід
 *     (TransitMovement recordKind=1) — лот вибуває з дороги (проданий або
 *     повернений на склад).
 *
 * **Склад тут НЕ рухаємо.** Складський баланс веде хук реалізації
 * (`sale-movement-hooks.ts`): продана реалізація (у т.ч. маршрутна) пише
 * `StockMovement` розхід. Повернені (не продані) лоти зі складу не списуються
 * взагалі — тож і повертати нічого. Транзит — окремий паралельний регістр
 * «що зараз у машинах», без подвійного обліку зі складом.
 *
 * Ключ реєстратора = локальний `RouteSheet.id`; прихід — lineNo 1..N, розхід —
 * lineNo 1001.. (окремий діапазон, щоб не конфліктувати з приходом).
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

/** Спільний upsert руху «в дорозі». */
async function upsertTransit(
  routeSheetId: string,
  lineNo: number,
  row: LoadingLine,
  productCode1C: string,
  clientCode1C: string | null,
  occurredAt: Date,
  recordKind: 0 | 1,
): Promise<void> {
  const qty = round3(row.quantity || 1);
  const weightKg = row.weight ? round3(row.weight) : null;
  await prisma.transitMovement.upsert({
    where: {
      transit_movement_src: {
        recorderCode1C: routeSheetId,
        lineNo,
        productCode1C,
      },
    },
    create: {
      occurredAt,
      recorderCode1C: routeSheetId,
      lineNo,
      productCode1C,
      productId: row.productId,
      lotCode1C: row.barcode,
      lotId: row.lotId,
      clientCode1C,
      qty,
      weightKg,
      recordKind,
    },
    update: { qty, weightKg, clientCode1C, recordKind },
  });
}

/** Відправка МЛ: кожен завантажений лот → дорога прихід (recordKind=0). */
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
      await upsertTransit(
        routeSheetId,
        lineNo,
        row,
        productCode1C,
        clientCode1C,
        ctx.occurredAt,
        0,
      );
    }
  })().catch((e: unknown) => {
    console.warn("[L-TEX] Failed to apply dispatch transit movements", {
      routeSheetId,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}

/** Завершення МЛ: кожен лот вибуває з дороги (recordKind=1). */
export function applyCompleteTransitSafe(routeSheetId: string): void {
  void (async () => {
    const ctx = await loadContext(routeSheetId);
    if (!ctx || ctx.code1C || ctx.rows.length === 0) return;

    // Окремий діапазон lineNo (щоб не конфліктувати з приходом 1..N).
    let lineNo = 1000;
    for (const row of ctx.rows) {
      lineNo += 1;
      const productCode1C = resolveProductCode(row, ctx.productCodeById);
      const clientCode1C = row.customerId
        ? (ctx.clientCodeById.get(row.customerId) ?? null)
        : null;
      await upsertTransit(
        routeSheetId,
        lineNo,
        row,
        productCode1C,
        clientCode1C,
        ctx.occurredAt,
        1,
      );
    }
  })().catch((e: unknown) => {
    console.warn("[L-TEX] Failed to apply complete transit movements", {
      routeSheetId,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}
