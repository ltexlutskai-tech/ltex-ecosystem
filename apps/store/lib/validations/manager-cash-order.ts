import { z } from "zod";

/**
 * Zod schema для POST /api/v1/manager/cash-orders body (Блок «Реалізація»,
 * Етап 4 — касовий ордер / каса).
 *
 * Оплата прихідного касового ордера (`type=income`) по реалізації у 3 валютах
 * (грн/EUR/USD) + безнал грн. Здача обчислюється на сервері через курси-знімок
 * реалізації; при здачі > 0 авто-створюється другий ордер-розхід.
 *
 * Суми зберігаються «сирими» по валюті; усі порівняння йдуть через грн.
 */
const MAX_AMOUNT = 10_000_000;

const amountField = z.number().nonnegative().max(MAX_AMOUNT).default(0);

export const CHANGE_CURRENCIES = ["UAH", "EUR", "USD"] as const;
export type ChangeCurrency = (typeof CHANGE_CURRENCIES)[number];

export const createCashOrderSchema = z
  .object({
    saleId: z.string().min(1),
    /** Готівка, грн. */
    amountUah: amountField,
    /** Готівка, EUR. */
    amountEur: amountField,
    /** Готівка, USD. */
    amountUsd: amountField,
    /** Безготівка, грн. */
    amountUahCashless: amountField,
    /** Банківський рахунок (для безналу). */
    bankAccount: z.string().max(120).optional(),
    /** Стаття руху коштів. */
    cashFlowArticle: z.string().max(120).optional(),
    comment: z.string().max(2000).optional(),
    /** Валюта здачі (для авто-ордера розходу). */
    changeCurrency: z.enum(CHANGE_CURRENCIES).optional().default("UAH"),
  })
  .refine(
    (v) => v.amountUah + v.amountEur + v.amountUsd + v.amountUahCashless > 0,
    {
      message: "Має бути вказана хоча б одна сума оплати > 0",
      path: ["amountUah"],
    },
  );

export type CreateCashOrderInput = z.infer<typeof createCashOrderSchema>;
/** Pre-parse shape (defaults optional) — приймається `createCashOrderWithChange`. */
export type CreateCashOrderInputRaw = z.input<typeof createCashOrderSchema>;
