import { z } from "zod";

/**
 * Валідації блоку «Відеозона» (MgrVideoTask + MgrVideoTaskBag).
 *
 * Життєвий цикл: `new` (склад збирає мішки) → `filming` (мішки у відеозоні) →
 * `done`. Менеджер створює завдання; склад сканує кожен мішок (add-bag) і
 * передає у відеозону (advance); відеозона заповнює по кожному мішку
 * характеристики (patch-bag) + формує опис; «Готово» (done).
 */

/** Створення завдання менеджером. */
export const createVideoTaskSchema = z.object({
  productId: z.string().min(1, "Оберіть товар"),
  clientId: z.string().min(1, "Оберіть клієнта"),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  requestedBarcode: z.string().trim().max(120).optional().nullable(),
});
export type CreateVideoTaskInput = z.infer<typeof createVideoTaskSchema>;

/** Склад сканує черговий мішок. */
export const addBagSchema = z.object({
  lotId: z.string().min(1).optional(),
  barcode: z.string().trim().min(1).optional(),
});
export type AddBagInput = z.infer<typeof addBagSchema>;

/** Редагування завдання (спільні характеристики + планова к-сть мішків). */
export const patchVideoTaskSchema = z.object({
  season: z.string().trim().max(120).optional().nullable(),
  quality: z.string().trim().max(120).optional().nullable(),
  gender: z.string().trim().max(120).optional().nullable(),
  sizes: z.string().trim().max(200).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(999).optional(),
});
export type PatchVideoTaskInput = z.infer<typeof patchVideoTaskSchema>;

/** Відеозона зберігає характеристики конкретного мішка. */
export const patchBagSchema = z.object({
  unitsCount: z.string().trim().max(120).optional().nullable(),
  unitWeight: z.string().trim().max(120).optional().nullable(),
  lotWeightKg: z.coerce.number().min(0).max(100000).optional().nullable(),
  videoUrl: z.string().trim().max(500).optional().nullable(),
});
export type PatchBagInput = z.infer<typeof patchBagSchema>;
