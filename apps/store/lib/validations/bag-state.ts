import { z } from "zod";

/**
 * Zod-схеми документа «Зміна стану мішка» (← 1С ИзменениеСостоянияМешка).
 *
 * Рядок = один мішок (ідентифікується за `barcode`). Усі поля стану —
 * опційні/з дефолтами; при проведенні вони записуються в сам `Lot`.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

export const bagStateItemSchema = z.object({
  barcode: z.string().trim().min(1, "Порожній ШК").max(127),
  productId: z.string().trim().max(64).optional().nullable(),
  isOpen: z.boolean().optional().default(false),
  hasVideo: z.boolean().optional().default(false),
  isTarget: z.boolean().optional().default(false),
  onAir: z.boolean().optional().default(false),
  onAirDelivery: z.boolean().optional().default(false),
  youtubeUrl: optionalText(127),
  description: optionalText(1000),
  comment: optionalText(1000),
  // «Бронь» = торговий агент (User.id); «Контрагент» = клієнт (MgrClient.id).
  reservedAgentUserId: z.string().trim().max(64).optional().nullable(),
  reservedClientId: z.string().trim().max(64).optional().nullable(),
  reservedUntil: z
    .string()
    .datetime({ message: "Невірна дата броні" })
    .optional()
    .nullable(),
  // Сектор — текст назви (find-or-create у довіднику при проведенні).
  sector: optionalText(64),
});

export type BagStateItemInput = z.infer<typeof bagStateItemSchema>;

export const createBagStateSchema = z.object({
  docDate: z
    .string()
    .datetime({ message: "Невірна дата документа" })
    .optional(),
  notes: optionalText(250),
  items: z
    .array(bagStateItemSchema)
    .min(1, "Додайте хоча б один мішок")
    .max(500),
});

export type CreateBagStateInput = z.infer<typeof createBagStateSchema>;

/** Оновлення чернетки — та сама форма, items замінюються повністю. */
export const updateBagStateSchema = z.object({
  docDate: z
    .string()
    .datetime({ message: "Невірна дата документа" })
    .optional(),
  notes: optionalText(250),
  items: z
    .array(bagStateItemSchema)
    .min(1, "Додайте хоча б один мішок")
    .max(500),
});

export type UpdateBagStateInput = z.infer<typeof updateBagStateSchema>;
