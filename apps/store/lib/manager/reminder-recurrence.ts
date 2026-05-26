/**
 * Recurrence-хелпери для нагадувань (блок «Нагадування», Етап 1).
 *
 * Pure-функції (без I/O, без `new Date()` без аргументу) → легко тестуються.
 *
 * `MgrReminderPeriod` ∈ none|daily|weekly|monthly|yearly|event. Реальні
 * повторювані режими — daily/weekly/monthly/yearly; none/event не повторюються.
 */

export type MgrReminderPeriod =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "event";

const RECURRING: ReadonlySet<MgrReminderPeriod> = new Set<MgrReminderPeriod>([
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

/**
 * Чи є період справжнім повторюваним (перестворюється сам)?
 * none/event → false.
 */
export function isRecurring(period: MgrReminderPeriod): boolean {
  return RECURRING.has(period);
}

/**
 * Наступне спрацювання відносно `from`:
 *  - daily   → +1 день
 *  - weekly  → +7 днів
 *  - monthly → +1 місяць (той самий день місяця; clamp на кінець місяця,
 *    напр. 31 січ → 28/29 лют)
 *  - yearly  → +1 рік (clamp 29 лют невисокосного → 28 лют)
 *  - none/event → null (не повторюється)
 *
 * Час доби (години/хвилини/секунди) зберігається.
 */
export function nextOccurrence(
  from: Date,
  period: MgrReminderPeriod,
): Date | null {
  switch (period) {
    case "daily":
      return addDays(from, 1);
    case "weekly":
      return addDays(from, 7);
    case "monthly":
      return addMonthsClamped(from, 1);
    case "yearly":
      return addMonthsClamped(from, 12);
    case "none":
    case "event":
      return null;
  }
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + days);
  return r;
}

/**
 * Додає `months` місяців зі стабільним clamp-ом дня:
 * якщо цільовий місяць коротший за `day-of-month` (напр. 31 → лютий), —
 * прив'язуємо до останнього дня цільового місяця, а не до «перетікання»
 * у наступний місяць (як це робив би нативний `setMonth`).
 */
function addMonthsClamped(d: Date, months: number): Date {
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;

  const lastDay = daysInMonth(targetYear, targetMonth);
  const clampedDay = Math.min(day, lastDay);

  return new Date(
    targetYear,
    targetMonth,
    clampedDay,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );
}

function daysInMonth(year: number, monthIndex: number): number {
  // day 0 наступного місяця = останній день поточного
  return new Date(year, monthIndex + 1, 0).getDate();
}

const WEEKDAYS_UK = [
  "неділю",
  "понеділок",
  "вівторок",
  "середу",
  "четвер",
  "п'ятницю",
  "суботу",
] as const;

const MONTHS_UK_GENITIVE = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function timeLabel(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Українська підказка під полем дати (дослівно з BSL аудиту §6):
 *  - daily   → `Кожен день о ГГ:хх`
 *  - weekly  → `Кожен <день тижня (знах. відм.)> о ГГ:хх`
 *  - monthly → `Кожен <N> день місяця о ГГ:хх`
 *  - yearly  → `Кожен рік <d MMMM> о ГГ:хх`
 *  - none/event → null
 */
export function recurrenceHint(
  remindAt: Date,
  period: MgrReminderPeriod,
): string | null {
  const time = timeLabel(remindAt);
  switch (period) {
    case "daily":
      return `Кожен день о ${time}`;
    case "weekly":
      return `Кожен ${WEEKDAYS_UK[remindAt.getDay()]} о ${time}`;
    case "monthly":
      return `Кожен ${remindAt.getDate()} день місяця о ${time}`;
    case "yearly":
      return `Кожен рік ${remindAt.getDate()} ${MONTHS_UK_GENITIVE[remindAt.getMonth()]} о ${time}`;
    case "none":
    case "event":
      return null;
  }
}
