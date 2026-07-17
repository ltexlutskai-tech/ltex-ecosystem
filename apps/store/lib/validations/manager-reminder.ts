import { z } from "zod";

/**
 * Zod-схеми для standalone-нагадувань (блок «Нагадування»).
 *
 * Тип «Звичайне» (Етап 1): clientId опційний, періодичність, прапорець «Заказ
 * відео», body+remindAt обов'язкові.
 *
 * Тип «Для товарів» (Етап 2): per-client чек-лист товарів. clientId
 * **обов'язковий**, items (≥1), body опційний, без remindAt/періодичності
 * (подієве нагадування — periodicity=event, remindAt=now ставиться сервером).
 */

export const REMINDER_PERIODS = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "event",
] as const;

export const reminderPeriodSchema = z.enum(REMINDER_PERIODS);

/** Один рядок чек-листа товарів (тип «Для товарів»). */
export const reminderItemSchema = z.object({
  productId: z.string().min(1, "Не вказано товар"),
  quantity: z.coerce.number().int().min(1).default(1),
});

export type ReminderItemInput = z.infer<typeof reminderItemSchema>;

/**
 * Тип «Звичайне» — body+remindAt обов'язкові, клієнт опційний.
 *
 * Опційні `lotId`/`productId` несе лише сценарій «Замовити відео» (стеження
 * за появою відео): cron `generate-reminders` дивиться на них, щоб «спрацювати»
 * нагадування коли на лоті/товарі з'явилось відео. Для звичайного нагадування
 * вони просто null.
 */
const regularReminderSchema = z.object({
  isProductReminder: z.literal(false).optional(),
  body: z.string().trim().min(1, "Текст не може бути порожнім").max(500),
  remindAt: z.string().datetime({ offset: true, message: "Невірна дата" }),
  periodicity: reminderPeriodSchema.default("none"),
  orderVideo: z.boolean().default(false),
  clientId: z.string().min(1).nullable().optional(),
  lotId: z.string().min(1).nullable().optional(),
  productId: z.string().min(1).nullable().optional(),
});

/**
 * Тип «Для товарів» — клієнт обов'язковий, ≥1 товар, body опційний.
 * `orderId` опційний — заповнюється, коли нагадування створене із замовлення
 * (1С «ИзЗаказа»); дає лінк «↗ Замовлення» на картці нагадування.
 */
const productReminderSchema = z.object({
  isProductReminder: z.literal(true),
  clientId: z.string().min(1, "Оберіть клієнта"),
  items: z.array(reminderItemSchema).min(1, "Додайте хоча б один товар"),
  body: z.string().trim().max(500).optional(),
  orderId: z.string().min(1).nullable().optional(),
});

/**
 * Дискримінована unija на `isProductReminder`. POST без `isProductReminder`
 * (undefined) трактується як «Звичайне» (back-compat) — досягається через
 * preprocess: нормалізуємо відсутній прапорець у `false`.
 */
export const createReminderSchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const obj = raw as Record<string, unknown>;
      if (obj.isProductReminder === undefined) {
        return { ...obj, isProductReminder: false };
      }
    }
    return raw;
  },
  z.discriminatedUnion("isProductReminder", [
    productReminderSchema,
    regularReminderSchema.extend({ isProductReminder: z.literal(false) }),
  ]),
);

export type CreateReminderInput = z.infer<typeof createReminderSchema>;

export const patchReminderSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("uncomplete") }),
  z.object({ action: z.literal("completeItem"), itemId: z.string().min(1) }),
  z.object({ action: z.literal("uncompleteItem"), itemId: z.string().min(1) }),
  z.object({
    action: z.literal("snooze"),
    snoozedUntil: z
      .string()
      .datetime({ offset: true, message: "Невірна дата відкладання" }),
  }),
  z.object({
    action: z.literal("edit"),
    body: z.string().trim().min(1).max(500).optional(),
    remindAt: z.string().datetime({ offset: true }).optional(),
    periodicity: reminderPeriodSchema.optional(),
    orderVideo: z.boolean().optional(),
  }),
]);

export type PatchReminderInput = z.infer<typeof patchReminderSchema>;
