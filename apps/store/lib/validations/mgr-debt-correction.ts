import { z } from "zod";

/**
 * 5.4.5c — ручна корекція боргу клієнта.
 *
 * `direction` керує знаком:
 *   increase — борг зростає (+),
 *   decrease — списання / зменшення боргу (−).
 *
 * Підписаний рух обчислюється у ендпоінті:
 *   signed = direction === "decrease" ? -Math.abs(amountEur) : Math.abs(amountEur)
 */
export const debtCorrectionSchema = z.object({
  amountEur: z
    .number()
    .finite()
    .refine((n) => n !== 0, "Сума не може бути 0"),
  direction: z.enum(["increase", "decrease"]),
  note: z.string().trim().max(500).optional().nullable(),
});

export type DebtCorrectionInput = z.infer<typeof debtCorrectionSchema>;
