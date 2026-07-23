import { z } from "zod";

/**
 * Валідації блоку «Відеозона» (MgrVideoTask).
 *
 * Життєвий цикл: `new` (склад несе мішок) → `filming` (мішок у відеозоні) →
 * `done`. Менеджер створює завдання (create), склад приносить мішок (bring),
 * відеозона заповнює характеристики (patch) + формує опис (description) + «Готово»
 * (done).
 */

/** Створення завдання менеджером (з Прайсу / картки лоту / картки клієнта). */
export const createVideoTaskSchema = z.object({
  productId: z.string().min(1, "Оберіть товар"),
  clientId: z.string().min(1, "Оберіть клієнта"),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  /** Конкретний ШК (коли замовлено з деталей по мішку). Інакше склад бере рандом. */
  requestedBarcode: z.string().trim().max(120).optional().nullable(),
});

export type CreateVideoTaskInput = z.infer<typeof createVideoTaskSchema>;

/** Склад приносить мішок: обраний вільний лот → статус `filming`. */
export const bringVideoTaskSchema = z.object({
  lotId: z.string().min(1).optional(),
  barcode: z.string().trim().min(1).optional(),
});

export type BringVideoTaskInput = z.infer<typeof bringVideoTaskSchema>;

/** Відеозона зберігає чернетку характеристик + посилання на відео. */
export const patchVideoTaskSchema = z.object({
  season: z.string().trim().max(120).optional().nullable(),
  quality: z.string().trim().max(120).optional().nullable(),
  gender: z.string().trim().max(120).optional().nullable(),
  sizes: z.string().trim().max(200).optional().nullable(),
  unitsCount: z.string().trim().max(120).optional().nullable(),
  unitWeight: z.string().trim().max(120).optional().nullable(),
  lotWeightKg: z.coerce.number().min(0).max(100000).optional().nullable(),
  videoUrl: z.string().trim().max(500).optional().nullable(),
});

export type PatchVideoTaskInput = z.infer<typeof patchVideoTaskSchema>;
