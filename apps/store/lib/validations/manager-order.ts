import { z } from "zod";

/**
 * Zod schema для POST /api/v1/manager/orders body.
 *
 * Item shape: `lotId` nullable — `null` означає "загальна позиція" (1С обере
 * вільний лот пізніше); конкретний lotId — bind на конкретний bag/lot з
 * known barcode. Це віддзеркалює `OrderItem.lotId` nullable з міграції
 * `20260502_product_attrs_lot_optional`.
 *
 * `exchangeRate` optional — якщо не передано, server підставить
 * `getCurrentRate()` (current EUR→UAH з 1С feed).
 */
export const orderItemInputSchema = z.object({
  productId: z.string().min(1),
  lotId: z.string().nullable().optional(),
  weight: z.number().positive().max(10_000),
  quantity: z.number().int().positive().max(10_000).default(1),
  priceEur: z.number().nonnegative().max(100_000),
});

export const createOrderSchema = z.object({
  customerId: z.string().min(1),
  notes: z.string().max(2000).optional(),
  exchangeRate: z.number().positive().max(1000).optional(),
  items: z.array(orderItemInputSchema).min(1).max(200),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
