import { z } from "zod";

/** Zod-схеми створення документів руху товару (Фаза 5). */

const dateSchema = z.preprocess((v) => {
  if (typeof v === "string" || v instanceof Date) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}, z.date().optional());

const lineSchema = z.object({
  productId: z.string().min(1).nullable().optional(),
  charHex: z.string().max(64).nullable().optional(),
  barcode: z.string().max(64).nullable().optional(),
  weight: z.number().min(0).default(0),
  quantity: z.number().int().min(0).default(1),
  priceEur: z.number().min(0).default(0),
  notes: z.string().max(500).nullable().optional(),
});
export type StockDocLineInput = z.infer<typeof lineSchema>;

const baseHeader = z.object({
  docDate: dateSchema,
  warehouseId: z.string().min(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(lineSchema).default([]),
});

export const productReturnSchema = baseHeader.extend({
  customerId: z.string().min(1).nullable().optional(),
  customerName: z.string().max(300).nullable().optional(),
  saleId: z.string().min(1).nullable().optional(),
  exchangeRate: z.number().min(0).default(1),
});
export type ProductReturnInput = z.infer<typeof productReturnSchema>;

export const warehouseReturnSchema = baseHeader;
export type WarehouseReturnInput = z.infer<typeof warehouseReturnSchema>;

export const supplierReturnSchema = baseHeader.extend({
  supplierId: z.string().min(1).nullable().optional(),
  supplierName: z.string().max(300).nullable().optional(),
  exchangeRate: z.number().min(0).default(1),
});
export type SupplierReturnInput = z.infer<typeof supplierReturnSchema>;

const repackLineSchema = lineSchema.extend({
  role: z.enum(["disassembled", "assembled"]).default("disassembled"),
  // РОЗБІР: конкретний джерельний лот (зі скану ШК).
  sourceLotId: z.string().min(1).nullable().optional(),
  // КОМПЛЕКТАЦІЯ: ЦінаПродажуВес €/кг, якість, сектор, постачальник (назвою).
  salePriceEur: z.number().min(0).nullable().optional(),
  qualityId: z.string().min(1).nullable().optional(),
  sector: z.string().max(120).nullable().optional(),
  sectorId: z.string().min(1).nullable().optional(),
  supplierName: z.string().max(300).nullable().optional(),
});
export const repackingSchema = baseHeader.extend({
  items: z.array(repackLineSchema).default([]),
});
export type RepackingInput = z.infer<typeof repackingSchema>;

export const writeOffSchema = baseHeader.extend({
  reason: z.string().max(500).nullable().optional(),
});
export type WriteOffInput = z.infer<typeof writeOffSchema>;

export const stockAdjustmentSchema = baseHeader.extend({
  reason: z.string().max(500).nullable().optional(),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

const inventoryLineSchema = lineSchema.extend({
  qtyAccounting: z.number().min(0).default(0),
  qtyActual: z.number().min(0).default(0),
});
export const inventorySchema = baseHeader.extend({
  items: z.array(inventoryLineSchema).default([]),
});
export type InventoryInput = z.infer<typeof inventorySchema>;

export const stockTransferSchema = baseHeader.extend({
  fromWarehouseId: z.string().min(1).nullable().optional(),
  toWarehouseId: z.string().min(1).nullable().optional(),
});
export type StockTransferInput = z.infer<typeof stockTransferSchema>;
