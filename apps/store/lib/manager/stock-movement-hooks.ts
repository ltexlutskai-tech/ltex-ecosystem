import { prisma, type PrismaClient } from "@ltex/db";
import type { StockDocKind } from "./stock-documents";

/**
 * Крос-фазова інтеграція (Фаза 5 × Фаза 2): при проведенні складського документа
 * пишемо рухи у регістр `StockMovement` (1С AccumRg ТоварыНаСкладах). Дзеркалить
 * патерн борг-hook (`applyDebtMovementSafe` → `MgrDebtMovement`):
 *  - окрема таблиця рухів;
 *  - idempotent-ключ джерела `recorderCode1C + lineNo + productCode1C`
 *    (recorder = `id` локального документа — code1C у нього нема);
 *  - best-effort: НІКОЛИ не валить проведення (лише логує warn).
 *
 * Знаки руху (`recordKind`: 0=прихід / 1=розхід зі складу):
 *  - Списання / Повернення на склад* / Повернення постачальнику            → розхід
 *  - Оприбуткування / Інвентаризація(надлишок) / Повернення від покупця    → прихід
 *  - Переміщення: відправник → розхід, одержувач → прихід
 *  - Перепаковка: розбирані → розхід, скомплектовані → прихід
 *  - Інвентаризація: різниця факт−облік → прихід (+) / розхід (−)
 *
 * (*) «Повернення на склад» (WarehouseReturn) у 1С — це документ зворотного
 * списання з реалізації, тому товар у регістрі ТоварыНаСкладах фіксується як рух;
 * семантику обрано «розхід зі складу-джерела» за специфікацією задачі.
 */

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Один рух, що ляже у `StockMovement` (productCode1C обов'язковий). */
interface MovementRow {
  lineNo: number;
  productCode1C: string;
  productId: string | null;
  lotCode1C: string | null;
  warehouseCode1C: string | null;
  qty: number;
  weightKg: number | null;
  recordKind: 0 | 1;
}

interface RawItemLine {
  id: string;
  productId: string | null;
  charHex: string | null;
  barcode: string | null;
  /** Відсутні в інвентаризаційних рядках (там лише qty*). */
  weight?: number;
  quantity?: number;
  /** repacking */
  role?: string;
  /** inventory */
  qtyAccounting?: number;
  qtyActual?: number;
  qtyDifference?: number;
}

interface LoadedDoc {
  id: string;
  occurredAt: Date;
  warehouseId: string | null;
  toWarehouseId: string | null;
  fromWarehouseId: string | null;
  items: RawItemLine[];
}

/**
 * Резолвить `productCode1C` для рядка: Product.code1C (за productId) →
 * barcode → charHex → синтетичний ключ за id рядка (щоб рух завжди записався).
 */
function resolveProductCode(
  item: RawItemLine,
  codeByProductId: Map<string, string>,
): string {
  if (item.productId) {
    const code = codeByProductId.get(item.productId);
    if (code) return code;
  }
  return item.barcode || item.charHex || `doc-item:${item.id}`;
}

/**
 * Будує рухи складу для документа заданого типу. Чистий core (без БД):
 * приймає завантажений документ + мапу productId→code1C.
 */
export function buildStockMovementRows(
  kind: StockDocKind,
  doc: LoadedDoc,
  codeByProductId: Map<string, string>,
): MovementRow[] {
  const rows: MovementRow[] = [];
  let lineNo = 0;

  const push = (
    item: RawItemLine,
    recordKind: 0 | 1,
    qty: number,
    warehouseId: string | null,
  ) => {
    lineNo += 1;
    rows.push({
      lineNo,
      productCode1C: resolveProductCode(item, codeByProductId),
      productId: item.productId,
      lotCode1C: item.charHex,
      warehouseCode1C: warehouseId,
      qty: round3(Math.abs(qty)),
      weightKg: item.weight ? round3(Math.abs(item.weight)) : null,
      recordKind,
    });
  };

  for (const item of doc.items) {
    const qty = item.quantity || 0;
    switch (kind) {
      case "write-offs":
      case "warehouse-returns":
      case "supplier-returns":
        // Розхід зі складу-джерела.
        push(item, 1, qty, doc.warehouseId);
        break;
      case "product-returns":
      case "stock-adjustments":
        // Прихід на склад (повернення від покупця / оприбуткування надлишків).
        push(item, 0, qty, doc.warehouseId);
        break;
      case "repackings":
        // Розбирані → розхід; скомплектовані → прихід.
        push(item, item.role === "assembled" ? 0 : 1, qty, doc.warehouseId);
        break;
      case "inventories": {
        // Різниця факт−облік: + → прихід, − → розхід. 0 — пропускаємо.
        const diff =
          item.qtyDifference ??
          (item.qtyActual ?? 0) - (item.qtyAccounting ?? 0);
        if (diff === 0) break;
        push(item, diff > 0 ? 0 : 1, Math.abs(diff), doc.warehouseId);
        break;
      }
      case "stock-transfers":
        // Відправник → розхід; одержувач → прихід (два рухи на рядок).
        push(item, 1, qty, doc.fromWarehouseId ?? doc.warehouseId);
        push(item, 0, qty, doc.toWarehouseId);
        break;
    }
  }

  return rows;
}

/** Завантажує документ + рядки для заданого типу. null якщо не знайдено. */
async function loadDoc(
  db: PrismaClient,
  kind: StockDocKind,
  id: string,
): Promise<LoadedDoc | null> {
  const baseItem = {
    id: true,
    productId: true,
    charHex: true,
    barcode: true,
    weight: true,
    quantity: true,
  } as const;
  const norm = (
    raw: {
      id: string;
      docDate: Date;
      warehouseId?: string | null;
      fromWarehouseId?: string | null;
      toWarehouseId?: string | null;
      items: RawItemLine[];
    } | null,
  ): LoadedDoc | null =>
    raw
      ? {
          id: raw.id,
          occurredAt: raw.docDate,
          warehouseId: raw.warehouseId ?? null,
          fromWarehouseId: raw.fromWarehouseId ?? null,
          toWarehouseId: raw.toWarehouseId ?? null,
          items: raw.items,
        }
      : null;

  switch (kind) {
    case "product-returns":
      return norm(
        await db.productReturnFromCustomer.findUnique({
          where: { id },
          select: {
            id: true,
            docDate: true,
            warehouseId: true,
            items: { select: baseItem },
          },
        }),
      );
    case "warehouse-returns":
      return norm(
        await db.warehouseReturn.findUnique({
          where: { id },
          select: {
            id: true,
            docDate: true,
            warehouseId: true,
            items: { select: baseItem },
          },
        }),
      );
    case "supplier-returns":
      return norm(
        await db.returnToSupplier.findUnique({
          where: { id },
          select: {
            id: true,
            docDate: true,
            warehouseId: true,
            items: { select: baseItem },
          },
        }),
      );
    case "write-offs":
      return norm(
        await db.writeOff.findUnique({
          where: { id },
          select: {
            id: true,
            docDate: true,
            warehouseId: true,
            items: { select: baseItem },
          },
        }),
      );
    case "stock-adjustments":
      return norm(
        await db.stockAdjustment.findUnique({
          where: { id },
          select: {
            id: true,
            docDate: true,
            warehouseId: true,
            items: { select: baseItem },
          },
        }),
      );
    case "repackings":
      return norm(
        await db.repacking.findUnique({
          where: { id },
          select: {
            id: true,
            docDate: true,
            warehouseId: true,
            items: { select: { ...baseItem, role: true } },
          },
        }),
      );
    case "inventories":
      return norm(
        await db.inventory.findUnique({
          where: { id },
          select: {
            id: true,
            docDate: true,
            warehouseId: true,
            items: {
              select: {
                id: true,
                productId: true,
                charHex: true,
                barcode: true,
                qtyAccounting: true,
                qtyActual: true,
                qtyDifference: true,
              },
            },
          },
        }),
      );
    case "stock-transfers":
      return norm(
        await db.stockTransfer.findUnique({
          where: { id },
          select: {
            id: true,
            docDate: true,
            fromWarehouseId: true,
            toWarehouseId: true,
            items: { select: baseItem },
          },
        }),
      );
  }
}

// Inventory items return qtyAccounting/qtyActual as Decimal-ish numbers; weight
// is absent there → treat undefined as 0 у buildStockMovementRows (вже зроблено).

/**
 * Записує рухи `StockMovement` для проведеного документа. Best-effort:
 * fire-and-forget, ніколи не кидає (логує warn). Idempotent — upsert за
 * `recorderCode1C(=docId) + lineNo + productCode1C`.
 */
export function applyStockDocumentMovements(
  kind: StockDocKind,
  docId: string,
): void {
  void (async () => {
    const doc = await loadDoc(prisma, kind, docId);
    if (!doc || doc.items.length === 0) return;

    const productIds = [
      ...new Set(doc.items.map((i) => i.productId).filter(Boolean)),
    ] as string[];
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, code1C: true },
        })
      : [];
    const codeByProductId = new Map<string, string>();
    for (const p of products) if (p.code1C) codeByProductId.set(p.id, p.code1C);

    const rows = buildStockMovementRows(kind, doc, codeByProductId);
    if (rows.length === 0) return;

    for (const r of rows) {
      await prisma.stockMovement.upsert({
        where: {
          stock_movement_src: {
            recorderCode1C: docId,
            lineNo: r.lineNo,
            productCode1C: r.productCode1C,
          },
        },
        create: {
          occurredAt: doc.occurredAt,
          recorderCode1C: docId,
          lineNo: r.lineNo,
          warehouseCode1C: r.warehouseCode1C,
          productCode1C: r.productCode1C,
          productId: r.productId,
          lotCode1C: r.lotCode1C,
          qty: r.qty,
          weightKg: r.weightKg,
          recordKind: r.recordKind,
        },
        update: {
          occurredAt: doc.occurredAt,
          warehouseCode1C: r.warehouseCode1C,
          productId: r.productId,
          lotCode1C: r.lotCode1C,
          qty: r.qty,
          weightKg: r.weightKg,
          recordKind: r.recordKind,
        },
      });
    }
  })().catch((e: unknown) => {
    console.warn("[L-TEX] Failed to apply stock document movements", {
      kind,
      docId,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}

/**
 * Прибирає рухи складу документа (розпроведення / cancel). Best-effort.
 * Зараз reopen-роуту для складських документів нема — лишається готовим
 * на майбутнє (дзеркалить `revertReturnFromCustomerDebt`).
 */
export function removeStockDocumentMovements(docId: string): void {
  void (async () => {
    await prisma.stockMovement.deleteMany({
      where: { recorderCode1C: docId },
    });
  })().catch((e: unknown) => {
    console.warn("[L-TEX] Failed to remove stock document movements", {
      docId,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}
