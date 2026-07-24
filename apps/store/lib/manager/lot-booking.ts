import { z } from "zod";

/**
 * Manager «Прайс» — Stage 4 booking (бронювання лотів) pure logic.
 *
 * Бронь зберігається денормалізовано у самому `Lot` (reserved* поля + status).
 * Тут — чиста (DB-agnostic) логіка перевірок + Zod-схема. Endpoint лише I/O.
 *
 * Активна бронь — `reservedUntil >= now` (день «до» включно — на рівні дати).
 * Протермінована бронь (reserved* є, але `reservedUntil < now`) трактується як
 * вільний лот: його можна перебронювати на іншого клієнта.
 */

/** Мінімальний знімок броні лоту, потрібний для перевірок. */
export interface LotBookingState {
  status: string;
  reservedByUserId: string | null;
  reservedUntil: Date | null;
}

/**
 * Чи бронь лоту АКТИВНА на момент `now` — тобто існує дата `reservedUntil`,
 * яка ще не минула. Якщо `reservedUntil` немає — бронь не активна (вільний).
 */
export function isActiveReservation(
  lot: LotBookingState,
  now: Date = new Date(),
): boolean {
  if (!lot.reservedUntil) return false;
  return lot.reservedUntil.getTime() >= now.getTime();
}

/**
 * Чи можна забронювати лот: він вільний (немає активної броні) АБО його бронь
 * протермінована. Зайнятий активною бронню (будь-чиєю) — не можна.
 */
export function canBook(lot: LotBookingState, now: Date = new Date()): boolean {
  return !isActiveReservation(lot, now);
}

/**
 * Чи може цей менеджер ЗНЯТИ бронь: лише СВОЮ (reservedByUserId === userId) І
 * лише АКТИВНУ (протерміновану знімати нема сенсу — вона й так не діє). Чужу
 * активну бронь зняти не можна (endpoint поверне 403).
 */
export function canUnbook(
  lot: LotBookingState,
  userId: string,
  now: Date = new Date(),
): boolean {
  if (!isActiveReservation(lot, now)) return false;
  return lot.reservedByUserId === userId;
}

/** Знімок лоту для перевірки «Вилучити бронь» (ПКМ у таблицях лотів). */
export interface LotUnbookSnapshot {
  status: string;
  reservedByUserId: string | null;
  reservedForClientId?: string | null;
  reservedForName?: string | null;
  reservedUntil: Date | null;
}

/**
 * Чи може користувач ВИЛУЧИТИ бронь лоту (рішення user 2026-07-24):
 * лише менеджер, вказаний у броні (`reservedByUserId`), або admin/owner.
 * На відміну від `canUnbook`, дозволяє чистити й ПРОТЕРМІНОВАНУ власну бронь
 * (вона висить у таблицях як «протермін.»), а адміну — будь-чию.
 * Статуси sold/archived/in_transit не чіпаємо (там бронь — частина історії).
 */
export function canRemoveReservation(
  lot: LotUnbookSnapshot,
  viewer: { id: string; isAdmin: boolean },
): boolean {
  const hasReservation =
    lot.reservedUntil != null ||
    lot.reservedByUserId != null ||
    (lot.reservedForClientId ?? null) != null ||
    (lot.reservedForName ?? null) != null;
  if (!hasReservation) return false;
  if (lot.status !== "reserved" && lot.status !== "free") return false;
  if (viewer.isAdmin) return true;
  return lot.reservedByUserId != null && lot.reservedByUserId === viewer.id;
}

/**
 * Zod-схема тіла POST /book.
 *  • `clientId` — id MgrClient (обов'язково).
 *  • `until`    — дата «до якого числа» (ISO datetime), не раніше початку
 *                 сьогоднішнього дня (порівнюємо по даті, не по часу — щоб
 *                 «сьогодні» проходило незалежно від поточної години).
 */
export const bookLotSchema = z.object({
  clientId: z.string().trim().min(1, "Оберіть клієнта").max(64),
  until: z
    .string()
    .datetime({ message: "Невірна дата" })
    .refine(
      (iso) => {
        const until = new Date(iso);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return until.getTime() >= today.getTime();
      },
      { message: "Дата броні не може бути в минулому" },
    ),
});

export type BookLotInput = z.infer<typeof bookLotSchema>;
