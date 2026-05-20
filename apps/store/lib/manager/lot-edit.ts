import { z } from "zod";

/**
 * Manager «Прайс» — Stage 3a lot-card edit helpers.
 *
 * Менеджер редагує ЛИШЕ свої поля лоту (сектор, відкрито, коментар, опис,
 * ціль, дата відео). Поля з 1С — `weight` / `quantity` / `status` / `barcode`
 * / `arrivalDate` / `priceEur` / `videoUrl` — менеджер НЕ редагує (магазин на
 * них спирається). Будь-які такі поля у тілі PATCH ігноруються (не пишемо).
 *
 * Чиста (DB-agnostic) логіка тут — тестується окремо; endpoint лише I/O.
 */

/** Поля лоту, які менеджер може редагувати у Stage 3a. */
export const MANAGER_EDITABLE_LOT_FIELDS = [
  "sector",
  "isOpen",
  "comment",
  "description",
  "isTarget",
  "videoDate",
] as const;

export type ManagerEditableLotField =
  (typeof MANAGER_EDITABLE_LOT_FIELDS)[number];

const trimmedNullableText = (max: number) =>
  z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const t = v.trim();
      return t.length === 0 ? null : t;
    });

const nullableDate = z
  .union([z.string().datetime(), z.string().length(0), z.null()])
  .optional();

/**
 * Zod-схема PATCH тіла. Усі поля optional (часткове оновлення). Невідомі
 * ключі (weight/quantity/status/barcode/...) — `strip`-аються Zod-ом за
 * замовчуванням, тож навіть якщо клієнт надішле їх, у `parsed.data` їх не
 * буде. Додатковий guard у `pickEditableLotData` лишає тільки whitelist.
 */
export const lotPatchSchema = z.object({
  sector: trimmedNullableText(100),
  isOpen: z.boolean().optional(),
  comment: trimmedNullableText(2000),
  description: trimmedNullableText(5000),
  isTarget: z.boolean().optional(),
  videoDate: nullableDate,
});

/**
 * Тип валідованого тіла. Через `.transform()` у nullable-полях Zod виводить
 * їх як обов'язкові ключі зі значенням `string | null | undefined`. Для
 * `pickEditableLotData` достатньо часткового набору, тому беремо `Partial`.
 */
export type LotPatchInput = Partial<z.infer<typeof lotPatchSchema>>;

/** Prisma-сумісний підмножина даних для `lot.update`. */
export interface LotEditUpdateData {
  sector?: string | null;
  isOpen?: boolean;
  comment?: string | null;
  description?: string | null;
  isTarget?: boolean;
  videoDate?: Date | null;
}

/**
 * Будує об'єкт для `prisma.lot.update({ data })` із валідованого тіла —
 * ЛИШЕ дозволені менеджерські поля. Поля, яких немає у тілі, не потрапляють
 * в update (часткове оновлення). Заборонені поля фізично неможливі (їх немає
 * у схемі Zod), але навіть якби були — ця функція їх не пропустить.
 */
export function pickEditableLotData(input: LotPatchInput): LotEditUpdateData {
  const data: LotEditUpdateData = {};

  if (input.sector !== undefined) data.sector = input.sector;
  if (input.isOpen !== undefined) data.isOpen = input.isOpen;
  if (input.comment !== undefined) data.comment = input.comment;
  if (input.description !== undefined) data.description = input.description;
  if (input.isTarget !== undefined) data.isTarget = input.isTarget;
  if (input.videoDate !== undefined) {
    data.videoDate =
      input.videoDate && input.videoDate.length > 0
        ? new Date(input.videoDate)
        : null;
  }

  return data;
}
