import { z } from "zod";

/**
 * Zod-схеми для документа поступлення (← Тиждень 2 + правки 2026-06-04).
 *
 * Правки за відгуком user 2026-06-04:
 *   - quantity завжди = 1 (штрихкод унікальний → рядок = один мішок)
 *   - currency завжди = EUR (управлінський облік ведеться у EUR)
 *   - exchangeRate завжди = 1 (немає сенсу при currency=EUR)
 *   - прибрано inboundDocNumber / inboundDocDate (не використовуються)
 *   - purchasePrice = 0 за замовч., редагується тільки admin/owner
 */

export const BARCODE_SOURCES = ["scanned", "manual", "generated"] as const;

export const receivingItemSchema = z.object({
  productId: z.string().min(1),
  weight: z.number().positive().max(1000),
  // Quantity завжди = 1; primary key унікальності — barcode.
  // Залишено у схемі для backward-compat, але .default(1) і ігнорується.
  quantity: z.literal(1).default(1),
  purchasePrice: z.number().nonnegative().max(1_000_000).default(0),
  barcode: z.string().trim().min(2).max(64).optional().nullable(),
  barcodeSource: z.enum(BARCODE_SOURCES).default("generated"),
  sector: z.string().trim().max(64).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type ReceivingItemInput = z.infer<typeof receivingItemSchema>;

export const receivingCreateSchema = z.object({
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  docDate: z
    .string()
    .datetime()
    .or(z.date())
    .optional()
    .transform((v) => (v ? new Date(v) : new Date())),
  notes: z.string().trim().max(2000).optional().nullable(),
  items: z.array(receivingItemSchema).default([]),
});
export type ReceivingCreateInput = z.infer<typeof receivingCreateSchema>;

export const receivingUpdateSchema = receivingCreateSchema.partial().extend({
  // items оновлюються окремим патчем (replace-all)
  items: z.array(receivingItemSchema).optional(),
});
export type ReceivingUpdateInput = z.infer<typeof receivingUpdateSchema>;

export const receivingPostSchema = z.object({});

export const receivingCancelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
