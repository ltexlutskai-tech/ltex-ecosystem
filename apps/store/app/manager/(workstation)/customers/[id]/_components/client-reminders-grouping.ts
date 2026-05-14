import type { ClientReminder } from "./types";

export type ReminderBucket = "overdue" | "today" | "upcoming" | "done";

export interface ReminderGroup {
  bucket: ReminderBucket;
  title: string;
  items: ClientReminder[];
}

/**
 * Розділяє нагадування на 4 групи відносно `now`:
 *  - "overdue"  — completedAt=null & effectiveAt (remind | snoozedUntil) < сьогодні (початок дня)
 *  - "today"    — completedAt=null & effectiveAt у межах сьогодні
 *  - "upcoming" — completedAt=null & effectiveAt >= завтра
 *  - "done"     — completedAt != null
 *
 * `effectiveAt` = `snoozedUntilAt ?? remindAt` — snooze переносить дату напоминання.
 */
export function groupReminders(
  reminders: ClientReminder[],
  now: Date = new Date(),
): ReminderGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const overdue: ClientReminder[] = [];
  const today: ClientReminder[] = [];
  const upcoming: ClientReminder[] = [];
  const done: ClientReminder[] = [];

  for (const r of reminders) {
    if (r.completedAt) {
      done.push(r);
      continue;
    }
    const effective = new Date(r.snoozedUntilAt ?? r.remindAt);
    if (effective < startOfToday) overdue.push(r);
    else if (effective < startOfTomorrow) today.push(r);
    else upcoming.push(r);
  }

  return [
    { bucket: "overdue", title: "Прострочено", items: overdue },
    { bucket: "today", title: "Сьогодні", items: today },
    { bucket: "upcoming", title: "Заплановано", items: upcoming },
    { bucket: "done", title: "Виконано", items: done },
  ];
}

/**
 * Скільки прострочених (overdue) нагадувань. Зручно для bell-counter.
 */
export function countOverdue(
  reminders: ClientReminder[],
  now: Date = new Date(),
): number {
  return (
    groupReminders(reminders, now).find((g) => g.bucket === "overdue")?.items
      .length ?? 0
  );
}
