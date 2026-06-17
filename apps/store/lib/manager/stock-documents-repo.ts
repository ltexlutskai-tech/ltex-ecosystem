import { prisma, type PrismaClient } from "@ltex/db";
import { generateStockDocNumber, summarizeLines, applyReturnFromCustomerDebt, type StockDocKind } from "./stock-documents";

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
const linePriced = (l: NormLine) => ({ ...lineCommon(l), priceEur: l.priceEur, amountEur: l.amountEur });

export async function createStockDoc(kind: StockDocKind, input: CreateDocInput, db: PrismaClient = prisma): Promise<{ id: string; docNumber: string }> {
  const docNumber = await generateStockDocNumber(kind, input.docDate, db);
  const totals = summarizeLines(input.lines);
  return db.$transaction(async (tx) => {
    const h = { docNumber, docDate: input.docDate, warehouseId: input.warehouseId ?? null, notes: input.notes ?? null, status: "draft", createdByUserId: input.createdByUserId };
    const sums = { totalWeight: totals.totalWeight, totalQuantity: totals.totalQuantity };
    const sumsEur = { ...sums, totalEur: totals.totalEur };
    switch (kind) {
      case "product-returns": {
        const doc = await tx.productReturnFromCustomer.create({ data: { ...h, ...sumsEur, customerId: input.customerId ?? null, customerName: input.customerName ?? null, saleId: input.saleId ?? null, exchangeRate: input.exchangeRate ?? 1, items: { create: input.lines.map((l) => ({ ...linePriced(l), unitName: l.unitName ?? null })) } } });
        return { id: doc.id, docNumber };
      }
      case "warehouse-returns": {
        const doc = await tx.warehouseReturn.create({ data: { ...h, ...sums, items: { create: input.lines.map(lineCommon) } } });
        return { id: doc.id, docNumber };
      }
      case "supplier-returns": {
        const doc = await tx.returnToSupplier.create({ data: { ...h, ...sumsEur, supplierId: input.supplierId ?? null, supplierName: input.supplierName ?? null, exchangeRate: input.exchangeRate ?? 1, items: { create: input.lines.map(linePriced) } } });
        return { id: doc.id, docNumber };
      }
      case "repackings": {
        let inputWeight = 0;
        let outputWeight = 0;
        for (const l of input.lines) {
          if (l.role === "assembled") outputWeight += l.weight;
          else inputWeight += l.weight;
        }
        const doc = await tx.repacking.create({ data: { ...h, inputWeight: round2(inputWeight), outputWeight: round2(outputWeight), lossWeight: round2(inputWeight - outputWeight), items: { create: input.lines.map((l) => ({ role: l.role ?? "disassembled", ...linePriced(l) })) } } });
        return { id: doc.id, docNumber };
      }
      case "write-offs": {
        const doc = await tx.writeOff.create({ data: { ...h, ...sumsEur, reason: input.reason ?? null, items: { create: input.lines.map(linePriced) } } });
        return { id: doc.id, docNumber };
      }
      case "stock-adjustments": {
        const doc = await tx.stockAdjustment.create({ data: { ...h, ...sumsEur, reason: input.reason ?? null, items: { create: input.lines.map(linePriced) } } });
        return { id: doc.id, docNumber };
      }
      case "inventories": {
        const doc = await tx.inventory.create({ data: { ...h, items: { create: input.lines.map((l) => {
          const acc = l.qtyAccounting ?? 0;
          const act = l.qtyActual ?? l.quantity;
          return { productId: l.productId, charHex: l.charHex, barcode: l.barcode, qtyAccounting: acc, qtyActual: act, qtyDifference: round2(act - acc), priceEur: l.priceEur, notes: l.notes };
        }) } } });
        return { id: doc.id, docNumber };
      }
      case "stock-transfers": {
        const doc = await tx.stockTransfer.create({ data: { ...h, ...sums, fromWarehouseId: input.fromWarehouseId ?? null, toWarehouseId: input.toWarehouseId ?? null, items: { create: input.lines.map(lineCommon) } } });
        return { id: doc.id, docNumber };
      }
    }
  });
}

/**
 * Проводить документ: status draft→posted. Повернення від покупця → рух боргу
 * (best-effort, поза транзакцією). false якщо не знайдено / вже posted.
 */
export async function postStockDoc(kind: StockDocKind, id: string, userId: string, db: PrismaClient = prisma): Promise<{ ok: boolean; reason?: string }> {
  const postedData = { status: "posted", postedAt: new Date(), postedByUserId: userId };
  if (kind === "product-returns") {
    const doc = await db.productReturnFromCustomer.findUnique({ where: { id }, select: { id: true, status: true, customerId: true, totalEur: true, docDate: true } });
    if (!doc) return { ok: false, reason: "not_found" };
    if (doc.status === "posted") return { ok: false, reason: "already_posted" };
    await db.productReturnFromCustomer.update({ where: { id }, data: postedData });
    applyReturnFromCustomerDebt({ returnId: doc.id, customerId: doc.customerId, totalEur: Number(doc.totalEur), occurredAt: doc.docDate, createdByUserId: userId });
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
  return simplePost(delegate, id, postedData);
}

interface SimpleDelegate {
  findUnique(args: { where: { id: string }; select: { id: true; status: true } }): Promise<{ id: string; status: string } | null>;
  update(args: { where: { id: string }; data: { status: string; postedAt: Date; postedByUserId: string } }): Promise<unknown>;
}

async function simplePost(delegate: SimpleDelegate, id: string, data: { status: string; postedAt: Date; postedByUserId: string }): Promise<{ ok: boolean; reason?: string }> {
  const doc = await delegate.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!doc) return { ok: false, reason: "not_found" };
  if (doc.status === "posted") return { ok: false, reason: "already_posted" };
  await delegate.update({ where: { id }, data });
  return { ok: true };
}
