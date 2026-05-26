import { z } from "zod";

/**
 * Zod-схеми для standalone-нагадувань (блок «Нагадування», Етап 1).
 *
 * Тип «Звичайне»: clientId опційний, періодичність, прапорець «Заказ відео».
 * Тип «Для товарів» (isProductReminder + items) — пізніший етап; у Етапі 1
 * не приймаємо у POST.
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

export const createReminderSchema = z.object({
  body: z.string().trim().min(1, "Текст не може бути порожнім").max(500),
  remindAt: z.string().datetime({ offset: true, message: "Невірна дата" }),
  periodicity: reminderPeriodSchema.default("none"),
  orderVideo: z.boolean().default(false),
  clientId: z.string().min(1).nullable().optional(),
});

export type CreateReminderInput = z.infer<typeof createReminderSchema>;

export const patchReminderSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("uncomplete") }),
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
