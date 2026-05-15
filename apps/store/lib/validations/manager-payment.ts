import { z } from "zod";

/**
 * Zod schema для POST /api/v1/manager/payments body.
 *
 * Поки тільки create — список платежів read-only з 1С snapshot (M1.4).
 * Refund / cancel — поза scope (1С відстежує окремо).
 */
export const PAYMENT_METHODS = [
  "cash",
  "card",
  "bank_transfer",
  "online",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_CURRENCIES = ["UAH", "EUR", "USD"] as const;
export type PaymentCurrency = (typeof PAYMENT_CURRENCIES)[number];

export const createPaymentSchema = z.object({
  orderId: z.string().min(1),
  method: z.enum(PAYMENT_METHODS),
  amount: z.number().positive().max(10_000_000),
  currency: z.enum(PAYMENT_CURRENCIES).default("UAH"),
  externalId: z.string().max(200).optional(),
  paidAt: z.string().datetime().optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
