import { z } from "zod";

/**
 * Zod-схеми для документа поступлення (← Тиждень 2 блоку Поступлення).
 *
 * Розділили на 3 фази:
 *   - `receivingCreateSchema` — створення draft (мінімальні поля)
 *   - `receivingUpdateSchema` — оновлення draft (повний набір)
 *   - `receivingItemSchema`   — окремий рядок (нот-роутом /items)
 */

export const BARCODE_SOURCES = ["scanned", "manual", "generated"] as const;

export const receivingItemSchema = z.object({
  productId: z.string().min(1),
  weight: z.number().positive().max(1000),
  quantity: z.number().int().positive().max(10000).default(1),
  purchasePrice: z.number().nonnegative().max(1_000_000).default(0),
  barcode: z.string().trim().min(2).max(64).optional().nullable(),
  barcodeSource: z.enum(BARCODE_SOURCES).default("generated"),
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
  currency: z.string().trim().length(3).default("EUR"),
  exchangeRate: z.number().positive().max(10000).default(1),
  inboundDocNumber: z.string().trim().max(100).optional().nullable(),
  inboundDocDate: z
    .string()
    .or(z.date())
    .nullable()
    .optional()
    .transform((v) => (v ? new Date(v) : null)),
  notes: z.string().trim().max(2000).optional().nullable(),
  items: z.array(receivingItemSchema).default([]),
});
export type ReceivingCreateInput = z.infer<typeof receivingCreateSchema>;

export const receivingUpdateSchema = receivingCreateSchema.partial().extend({
  // items оновлюються окремим патчем (replace-all)
  items: z.array(receivingItemSchema).optional(),
});
export type ReceivingUpdateInput = z.infer<typeof receivingUpdateSchema>;

export const receivingPostSchema = z.object({
  // Жодних додаткових параметрів — проведення робиться на основі поточного
  // стану документа.
});

export const receivingCancelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
