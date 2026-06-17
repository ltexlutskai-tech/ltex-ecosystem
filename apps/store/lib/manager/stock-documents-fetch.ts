import { prisma } from "@ltex/db";
import type { StockDocKind } from "./stock-documents";

/** Серверне читання документа з рядками для сторінки перегляду (Фаза 5). */

export interface StockDocLineView {
  id: string;
  productId: string | null;
  barcode: string | null;
  weight: number;
  quantity: number;
  priceEur: number;
  amountEur: number;
  notes: string | null;
  role?: string;
  qtyAccounting?: number;
  qtyActual?: number;
  qtyDifference?: number;
}

export interface StockDocView {
  id: string;
  docNumber: string;
  number1C: string | null;
  docDate: Date;
  status: string;
  notes: string | null;
  postedAt: Date | null;
  totalWeight: number;
  totalQuantity: number;
  totalEur: number | null;
  customerName?: string | null;
  supplierName?: string | null;
  reason?: string | null;
  inputWeight?: number;
  outputWeight?: number;
  lossWeight?: number;
  isClosed?: boolean;
  lines: StockDocLineView[];
}

interface HeaderRow {
  id: string;
  docNumber: string;
  number1C: string | null;
  docDate: Date;
  status: string;
  notes: string | null;
  postedAt: Date | null;
  totalWeight?: number;
  totalQuantity?: number;
}

function headerCommon(d: HeaderRow, fallback?: { totalWeight: number; totalQuantity: number }): Omit<StockDocView, "totalEur" | "lines"> {
  return {
    id: d.id,
    docNumber: d.docNumber,
    number1C: d.number1C,
    docDate: d.docDate,
    status: d.status,
    notes: d.notes,
    postedAt: d.postedAt,
    totalWeight: d.totalWeight ?? fallback?.totalWeight ?? 0,
    totalQuantity: d.totalQuantity ?? fallback?.totalQuantity ?? 0,
  };
}

export async function fetchStockDoc(kind: StockDocKind, id: string): Promise<StockDocView | null> {
  switch (kind) {
    case "product-returns": {
      const d = await prisma.productReturnFromCustomer.findUnique({ where: { id }, include: { items: { orderBy: { createdAt: "asc" } } } });
      if (!d) return null;
      return { ...headerCommon(d), totalEur: Number(d.totalEur), customerName: d.customerName, lines: d.items.map((it) => ({ id: it.id, productId: it.productId, barcode: it.barcode, weight: it.weight, quantity: it.quantity, priceEur: Number(it.priceEur), amountEur: Number(it.amountEur), notes: it.notes })) };
    }
    case "warehouse-returns": {
      const d = await prisma.warehouseReturn.findUnique({ where: { id }, include: { items: { orderBy: { createdAt: "asc" } } } });
      if (!d) return null;
      return { ...headerCommon(d), totalEur: null, lines: d.items.map((it) => ({ id: it.id, productId: it.productId, barcode: it.barcode, weight: it.weight, quantity: it.quantity, priceEur: 0, amountEur: 0, notes: it.notes })) };
    }
    case "supplier-returns": {
      const d = await prisma.returnToSupplier.findUnique({ where: { id }, include: { items: { orderBy: { createdAt: "asc" } } } });
      if (!d) return null;
      return { ...headerCommon(d), totalEur: Number(d.totalEur), supplierName: d.supplierName, lines: d.items.map((it) => ({ id: it.id, productId: it.productId, barcode: it.barcode, weight: it.weight, quantity: it.quantity, priceEur: Number(it.priceEur), amountEur: Number(it.amountEur), notes: it.notes })) };
    }
    case "repackings": {
      const d = await prisma.repacking.findUnique({ where: { id }, include: { items: { orderBy: { createdAt: "asc" } } } });
      if (!d) return null;
      return { ...headerCommon(d, { totalWeight: 0, totalQuantity: 0 }), totalEur: null, inputWeight: d.inputWeight, outputWeight: d.outputWeight, lossWeight: d.lossWeight, lines: d.items.map((it) => ({ id: it.id, productId: it.productId, barcode: it.barcode, weight: it.weight, quantity: it.quantity, priceEur: Number(it.priceEur), amountEur: Number(it.amountEur), notes: it.notes, role: it.role })) };
    }
    case "write-offs": {
      const d = await prisma.writeOff.findUnique({ where: { id }, include: { items: { orderBy: { createdAt: "asc" } } } });
      if (!d) return null;
      return { ...headerCommon(d), totalEur: Number(d.totalEur), reason: d.reason, lines: d.items.map((it) => ({ id: it.id, productId: it.productId, barcode: it.barcode, weight: it.weight, quantity: it.quantity, priceEur: Number(it.priceEur), amountEur: Number(it.amountEur), notes: it.notes })) };
    }
    case "stock-adjustments": {
      const d = await prisma.stockAdjustment.findUnique({ where: { id }, include: { items: { orderBy: { createdAt: "asc" } } } });
      if (!d) return null;
      return { ...headerCommon(d), totalEur: Number(d.totalEur), reason: d.reason, lines: d.items.map((it) => ({ id: it.id, productId: it.productId, barcode: it.barcode, weight: it.weight, quantity: it.quantity, priceEur: Number(it.priceEur), amountEur: Number(it.amountEur), notes: it.notes })) };
    }
    case "inventories": {
      const d = await prisma.inventory.findUnique({ where: { id }, include: { items: { orderBy: { createdAt: "asc" } } } });
      if (!d) return null;
      return { ...headerCommon(d), totalEur: null, isClosed: d.isClosed, lines: d.items.map((it) => ({ id: it.id, productId: it.productId, barcode: it.barcode, weight: 0, quantity: it.qtyActual, priceEur: Number(it.priceEur), amountEur: 0, notes: it.notes, qtyAccounting: it.qtyAccounting, qtyActual: it.qtyActual, qtyDifference: it.qtyDifference })) };
    }
    case "stock-transfers": {
      const d = await prisma.stockTransfer.findUnique({ where: { id }, include: { items: { orderBy: { createdAt: "asc" } } } });
      if (!d) return null;
      return { ...headerCommon(d), totalEur: null, lines: d.items.map((it) => ({ id: it.id, productId: it.productId, barcode: it.barcode, weight: it.weight, quantity: it.quantity, priceEur: 0, amountEur: 0, notes: it.notes })) };
    }
  }
}
