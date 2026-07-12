import { prisma, type PrismaClient } from "@ltex/db";
import {
  generateStockDocNumber,
  summarizeLines,
  applyReturnFromCustomerDebt,
  revertReturnFromCustomerDebt,
  type StockDocKind,
} from "./stock-documents";
import {
  applyStockDocumentMovements,
  removeStockDocumentMovements,
} from "./stock-movement-hooks";
import {
  applyRepackFullCycle,
  removeRepackFullCycle,
} from "./repack-full-cycle";
import { getRepackWeightTolerance } from "./mgr-settings";

/**
 * Репозиторій документів руху товару (Фаза 5) — спільна CRUD-логіка 8 типів:
 * створення (шапка+рядки у транзакції) + проведення (status='posted' + hook).
 */

export interface NormLine {
  productId: string | null;
  charHex: string | null;
  barcode: string | null;
  weight: number;
  quantity: number;
  priceEur: number;
  amountEur: number;
  notes: string | null;
  role?: "disassembled" | "assembled";
  qtyAccounting?: number;
  qtyActual?: number;
  unitName?: string | null;
  // ── Інвентаризація по мішках (знімок рядка) ──
  lotId?: string | null;
  productName?: string | null;
  articleCode?: string | null;
  quality?: string | null;
  // ── Перепаковка повного циклу (поля рядків) ──
  sourceLotId?: string | null;
  salePriceEur?: number | null;
  qualityId?: string | null;
  sector?: string | null;
  sectorId?: string | null;
  supplierName?: string | null;
}

export interface CreateDocInput {
  docDate: Date;
  warehouseId?: string | null;
  notes?: string | null;
  lines: NormLine[];
  createdByUserId: string;
  customerId?: string | null;
  customerName?: string | null;
  saleId?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  exchangeRate?: number;
  reason?: string | null;
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Нормалізує сирий рядок: amountEur = weight*priceEur (fallback на quantity). */
export function normalizeLine(raw: {
  productId?: string | null;
  charHex?: string | null;
  barcode?: string | null;
  weight?: number;
  quantity?: number;
  priceEur?: number;
  notes?: string | null;
  role?: "disassembled" | "assembled";
  qtyAccounting?: number;
  qtyActual?: number;
  unitName?: string | null;
  lotId?: string | null;
  productName?: string | null;
  articleCode?: string | null;
  quality?: string | null;
  sourceLotId?: string | null;
  salePriceEur?: number | null;
  qualityId?: string | null;
  sector?: string | null;
  sectorId?: string | null;
  supplierName?: string | null;
}): NormLine {
  const weight = raw.weight ?? 0;
  const quantity = raw.quantity ?? 1;
  const priceEur = raw.priceEur ?? 0;
  const base = weight > 0 ? weight : quantity;
  return {
    productId: raw.productId ?? null,
    charHex: raw.charHex ?? null,
    barcode: raw.barcode ?? null,
    weight,
    quantity,
    priceEur,
    amountEur: round2(base * priceEur),
    notes: raw.notes ?? null,
    role: raw.role,
    qtyAccounting: raw.qtyAccounting,
    qtyActual: raw.qtyActual,
    unitName: raw.unitName ?? null,
    lotId: raw.lotId ?? null,
    productName: raw.productName ?? null,
    articleCode: raw.articleCode ?? null,
    quality: raw.quality ?? null,
    sourceLotId: raw.sourceLotId ?? null,
    salePriceEur: raw.salePriceEur ?? null,
    qualityId: raw.qualityId ?? null,
    sector: raw.sector ?? null,
    sectorId: raw.sectorId ?? null,
    supplierName: raw.supplierName ?? null,
  };
}

const lineCommon = (l: NormLine) => ({
  productId: l.productId,
  charHex: l.charHex,
  barcode: l.barcode,
  weight: l.weight,
  quantity: l.quantity,
  notes: l.notes,
});
const linePriced = (l: NormLine) => ({
  ...lineCommon(l),
  priceEur: l.priceEur,
  amountEur: l.amountEur,
});

/**
 * Рядок інвентаризації (по мішках): облік/факт + знімок мішка (назва/артикул/
 * вага/сектор/од./якість/lotId). `qtyDifference` = факт − облік
 * (+ надлишок / − нестача / 0 збіг).
 */
const inventoryItemCreate = (l: NormLine) => {
  const acc = l.qtyAccounting ?? 0;
  const act = l.qtyActual ?? l.quantity;
  return {
    productId: l.productId,
    charHex: l.charHex,
    barcode: l.barcode,
    lotId: l.lotId ?? null,
    productName: l.productName ?? null,
    articleCode: l.articleCode ?? null,
    weight: l.weight ?? 0,
    sector: l.sector ?? null,
    unitName: l.unitName ?? null,
    quality: l.quality ?? null,
    qtyAccounting: acc,
    qtyActual: act,
    qtyDifference: round2(act - acc),
    priceEur: l.priceEur,
    notes: l.notes,
  };
};

export async function createStockDoc(
  kind: StockDocKind,
  input: CreateDocInput,
  db: PrismaClient = prisma,
): Promise<{ id: string; docNumber: string }> {
  const docNumber = await generateStockDocNumber(kind, input.docDate, db);
  const totals = summarizeLines(input.lines);
  return db.$transaction(async (tx) => {
    const h = {
      docNumber,
      docDate: input.docDate,
      warehouseId: input.warehouseId ?? null,
      notes: input.notes ?? null,
      status: "draft",
      createdByUserId: input.createdByUserId,
    };
    const sums = {
      totalWeight: totals.totalWeight,
      totalQuantity: totals.totalQuantity,
    };
    const sumsEur = { ...sums, totalEur: totals.totalEur };
    switch (kind) {
      case "product-returns": {
        const doc = await tx.productReturnFromCustomer.create({
          data: {
            ...h,
            ...sumsEur,
            customerId: input.customerId ?? null,
            customerName: input.customerName ?? null,
            saleId: input.saleId ?? null,
            exchangeRate: input.exchangeRate ?? 1,
            items: {
              create: input.lines.map((l) => ({
                ...linePriced(l),
                unitName: l.unitName ?? null,
              })),
            },
          },
        });
        return { id: doc.id, docNumber };
      }
      case "warehouse-returns": {
        const doc = await tx.warehouseReturn.create({
          data: {
            ...h,
            ...sums,
            items: { create: input.lines.map(lineCommon) },
          },
        });
        return { id: doc.id, docNumber };
      }
      case "supplier-returns": {
        const doc = await tx.returnToSupplier.create({
          data: {
            ...h,
            ...sumsEur,
            supplierId: input.supplierId ?? null,
            supplierName: input.supplierName ?? null,
            exchangeRate: input.exchangeRate ?? 1,
            items: { create: input.lines.map(linePriced) },
          },
        });
        return { id: doc.id, docNumber };
      }
      case "repackings": {
        let inputWeight = 0;
        let outputWeight = 0;
        for (const l of input.lines) {
          if (l.role === "assembled") outputWeight += l.weight;
          else inputWeight += l.weight;
        }
        const doc = await tx.repacking.create({
          data: {
            ...h,
            inputWeight: round2(inputWeight),
            outputWeight: round2(outputWeight),
            lossWeight: round2(inputWeight - outputWeight),
            items: {
              create: input.lines.map((l) => ({
                role: l.role ?? "disassembled",
                ...linePriced(l),
                sourceLotId: l.sourceLotId ?? null,
                salePriceEur:
                  l.salePriceEur != null && l.salePriceEur > 0
                    ? l.salePriceEur
                    : null,
                qualityId: l.qualityId ?? null,
                sector: l.sector ?? null,
                sectorId: l.sectorId ?? null,
                supplierName: l.supplierName ?? null,
              })),
            },
          },
        });
        return { id: doc.id, docNumber };
      }
      case "write-offs": {
        const doc = await tx.writeOff.create({
          data: {
            ...h,
            ...sumsEur,
            reason: input.reason ?? null,
            items: { create: input.lines.map(linePriced) },
          },
        });
        return { id: doc.id, docNumber };
      }
      case "stock-adjustments": {
        const doc = await tx.stockAdjustment.create({
          data: {
            ...h,
            ...sumsEur,
            reason: input.reason ?? null,
            items: { create: input.lines.map(linePriced) },
          },
        });
        return { id: doc.id, docNumber };
      }
      case "inventories": {
        const doc = await tx.inventory.create({
          data: {
            ...h,
            items: { create: input.lines.map(inventoryItemCreate) },
          },
        });
        return { id: doc.id, docNumber };
      }
      case "stock-transfers": {
        const doc = await tx.stockTransfer.create({
          data: {
            ...h,
            ...sums,
            fromWarehouseId: input.fromWarehouseId ?? null,
            toWarehouseId: input.toWarehouseId ?? null,
            items: { create: input.lines.map(lineCommon) },
          },
        });
        return { id: doc.id, docNumber };
      }
    }
  });
}

/**
 * Оновлює ЧЕРНЕТКУ документа руху товару (autosave, План
 * AUTOSAVE_REALTIME_PLAN §2). Повна заміна шапки + рядків БЕЗ ефектів
 * проведення (не пише StockMovement / повний цикл перепаковки / рух боргу) —
 * облікові рухи з'являються ЛИШЕ при `postStockDoc`. Не змінює `docNumber`/
 * `status`. Caller (endpoint) гарантує, що документ у стані `draft`.
 */
export async function updateStockDoc(
  kind: StockDocKind,
  id: string,
  input: CreateDocInput,
  db: PrismaClient = prisma,
): Promise<{ id: string }> {
  const totals = summarizeLines(input.lines);
  const header = {
    docDate: input.docDate,
    warehouseId: input.warehouseId ?? null,
    notes: input.notes ?? null,
  };
  const sums = {
    totalWeight: totals.totalWeight,
    totalQuantity: totals.totalQuantity,
  };
  const sumsEur = { ...sums, totalEur: totals.totalEur };
  return db.$transaction(async (tx) => {
    switch (kind) {
      case "product-returns": {
        await tx.productReturnFromCustomer.update({
          where: { id },
          data: {
            ...header,
            ...sumsEur,
            customerId: input.customerId ?? null,
            customerName: input.customerName ?? null,
            saleId: input.saleId ?? null,
            exchangeRate: input.exchangeRate ?? 1,
            items: {
              deleteMany: {},
              create: input.lines.map((l) => ({
                ...linePriced(l),
                unitName: l.unitName ?? null,
              })),
            },
          },
        });
        return { id };
      }
      case "warehouse-returns": {
        await tx.warehouseReturn.update({
          where: { id },
          data: {
            ...header,
            ...sums,
            items: { deleteMany: {}, create: input.lines.map(lineCommon) },
          },
        });
        return { id };
      }
      case "supplier-returns": {
        await tx.returnToSupplier.update({
          where: { id },
          data: {
            ...header,
            ...sumsEur,
            supplierId: input.supplierId ?? null,
            supplierName: input.supplierName ?? null,
            exchangeRate: input.exchangeRate ?? 1,
            items: { deleteMany: {}, create: input.lines.map(linePriced) },
          },
        });
        return { id };
      }
      case "repackings": {
        let inputWeight = 0;
        let outputWeight = 0;
        for (const l of input.lines) {
          if (l.role === "assembled") outputWeight += l.weight;
          else inputWeight += l.weight;
        }
        await tx.repacking.update({
          where: { id },
          data: {
            ...header,
            inputWeight: round2(inputWeight),
            outputWeight: round2(outputWeight),
            lossWeight: round2(inputWeight - outputWeight),
            items: {
              deleteMany: {},
              create: input.lines.map((l) => ({
                role: l.role ?? "disassembled",
                ...linePriced(l),
                sourceLotId: l.sourceLotId ?? null,
                salePriceEur:
                  l.salePriceEur != null && l.salePriceEur > 0
                    ? l.salePriceEur
                    : null,
                qualityId: l.qualityId ?? null,
                sector: l.sector ?? null,
                sectorId: l.sectorId ?? null,
                supplierName: l.supplierName ?? null,
              })),
            },
          },
        });
        return { id };
      }
      case "write-offs": {
        await tx.writeOff.update({
          where: { id },
          data: {
            ...header,
            ...sumsEur,
            reason: input.reason ?? null,
            items: { deleteMany: {}, create: input.lines.map(linePriced) },
          },
        });
        return { id };
      }
      case "stock-adjustments": {
        await tx.stockAdjustment.update({
          where: { id },
          data: {
            ...header,
            ...sumsEur,
            reason: input.reason ?? null,
            items: { deleteMany: {}, create: input.lines.map(linePriced) },
          },
        });
        return { id };
      }
      case "inventories": {
        await tx.inventory.update({
          where: { id },
          data: {
            ...header,
            items: {
              deleteMany: {},
              create: input.lines.map(inventoryItemCreate),
            },
          },
        });
        return { id };
      }
      case "stock-transfers": {
        await tx.stockTransfer.update({
          where: { id },
          data: {
            ...header,
            ...sums,
            fromWarehouseId: input.fromWarehouseId ?? null,
            toWarehouseId: input.toWarehouseId ?? null,
            items: { deleteMany: {}, create: input.lines.map(lineCommon) },
          },
        });
        return { id };
      }
    }
  });
}

/** Статус документа (для гварда autosave — не оновлюємо проведений). */
export async function getStockDocStatus(
  kind: StockDocKind,
  id: string,
  db: PrismaClient = prisma,
): Promise<string | null> {
  const delegate = {
    "product-returns": db.productReturnFromCustomer,
    "warehouse-returns": db.warehouseReturn,
    "supplier-returns": db.returnToSupplier,
    repackings: db.repacking,
    "write-offs": db.writeOff,
    "stock-adjustments": db.stockAdjustment,
    inventories: db.inventory,
    "stock-transfers": db.stockTransfer,
  }[kind] as unknown as {
    findUnique(args: {
      where: { id: string };
      select: { status: true };
    }): Promise<{ status: string } | null>;
  };
  const doc = await delegate.findUnique({
    where: { id },
    select: { status: true },
  });
  return doc?.status ?? null;
}

/**
 * Проводить документ: status draft→posted. Повернення від покупця → рух боргу
 * (best-effort, поза транзакцією). false якщо не знайдено / вже posted.
 */
export async function postStockDoc(
  kind: StockDocKind,
  id: string,
  userId: string,
  db: PrismaClient = prisma,
): Promise<{ ok: boolean; reason?: string; weightWarning?: boolean }> {
  const postedData = {
    status: "posted",
    postedAt: new Date(),
    postedByUserId: userId,
  };
  if (kind === "product-returns") {
    const doc = await db.productReturnFromCustomer.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        customerId: true,
        totalEur: true,
        docDate: true,
      },
    });
    if (!doc) return { ok: false, reason: "not_found" };
    if (doc.status === "posted") return { ok: false, reason: "already_posted" };
    await db.productReturnFromCustomer.update({
      where: { id },
      data: postedData,
    });
    applyReturnFromCustomerDebt({
      returnId: doc.id,
      customerId: doc.customerId,
      totalEur: Number(doc.totalEur),
      occurredAt: doc.docDate,
      createdByUserId: userId,
    });
    // Товар повертається на склад → приходний рух StockMovement (best-effort).
    applyStockDocumentMovements(kind, id);
    return { ok: true };
  }
  const delegate: SimpleDelegate = {
    "warehouse-returns": db.warehouseReturn,
    "supplier-returns": db.returnToSupplier,
    repackings: db.repacking,
    "write-offs": db.writeOff,
    "stock-adjustments": db.stockAdjustment,
    inventories: db.inventory,
    "stock-transfers": db.stockTransfer,
  }[kind] as unknown as SimpleDelegate;
  const result = await simplePost(delegate, id, postedData);
  if (!result.ok) return result;
  // Рух складу при успішному проведенні (best-effort, не валить проведення).
  applyStockDocumentMovements(kind, id);
  // Перепаковка повного циклу: списання джерела + створення лотів + собівартість.
  // Виконується у своїй транзакції (усе-або-нічого); при помилці — відкат статусу.
  if (kind === "repackings") {
    try {
      const tolerance = await getRepackWeightTolerance();
      const r = await applyRepackFullCycle(id, tolerance, db);
      return { ok: true, weightWarning: r.weightWarning };
    } catch (e) {
      await db.repacking
        .update({
          where: { id },
          data: { status: "draft", postedAt: null, postedByUserId: null },
        })
        .catch(() => undefined);
      return {
        ok: false,
        reason: e instanceof Error ? e.message : "repack_apply_failed",
      };
    }
  }
  return result;
}

/**
 * Розпроводить документ (posted → draft) для повторного редагування.
 * Реверсує ефекти проведення наявними best-effort хелперами:
 *  - усі типи: `removeStockDocumentMovements` (рухи складу);
 *  - перепаковка: `removeRepackFullCycle` (видаляє створені лоти, відновлює
 *    джерельні, прибирає собівартість);
 *  - повернення від покупця: `revertReturnFromCustomerDebt` (рух боргу).
 * Потім status→draft. Далі документ редагується як звичайна чернетка.
 */
export async function reopenStockDoc(
  kind: StockDocKind,
  id: string,
  db: PrismaClient = prisma,
): Promise<{ ok: boolean; reason?: string }> {
  const status = await getStockDocStatus(kind, id, db);
  if (status === null) return { ok: false, reason: "not_found" };
  if (status !== "posted") return { ok: false, reason: "not_posted" };

  // Реверс доменних ефектів (best-effort — хелпери не кидають).
  removeStockDocumentMovements(id);
  if (kind === "repackings") removeRepackFullCycle(id, db);
  if (kind === "product-returns") revertReturnFromCustomerDebt(id);

  const delegate = {
    "product-returns": db.productReturnFromCustomer,
    "warehouse-returns": db.warehouseReturn,
    "supplier-returns": db.returnToSupplier,
    repackings: db.repacking,
    "write-offs": db.writeOff,
    "stock-adjustments": db.stockAdjustment,
    inventories: db.inventory,
    "stock-transfers": db.stockTransfer,
  }[kind] as unknown as {
    update(args: {
      where: { id: string };
      data: { status: string; postedAt: null; postedByUserId: null };
    }): Promise<unknown>;
  };
  await delegate.update({
    where: { id },
    data: { status: "draft", postedAt: null, postedByUserId: null },
  });
  return { ok: true };
}

interface SimpleDelegate {
  findUnique(args: {
    where: { id: string };
    select: { id: true; status: true };
  }): Promise<{ id: string; status: string } | null>;
  update(args: {
    where: { id: string };
    data: { status: string; postedAt: Date; postedByUserId: string };
  }): Promise<unknown>;
}

async function simplePost(
  delegate: SimpleDelegate,
  id: string,
  data: { status: string; postedAt: Date; postedByUserId: string },
): Promise<{ ok: boolean; reason?: string }> {
  const doc = await delegate.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!doc) return { ok: false, reason: "not_found" };
  if (doc.status === "posted") return { ok: false, reason: "already_posted" };
  await delegate.update({ where: { id }, data });
  return { ok: true };
}
