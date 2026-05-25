/**
 * Блок «Маршрутний лист», Етап 4 — попередження про незакритий кілометраж
 * попередньої зміни (порт 1С `Кілометраж/Module.bsl`, `ПередЗакрытием`
 * «Немає кінцевого кілометражу за попередню зміну!»).
 *
 * **М'який блок:** 1С блокує закриття форми, але user вирішив, що у нашій
 * реалізації це лише попередження-банер (не hard block) — повертаємо рядок
 * або `null`. I/O — читає маршрутні листи того ж експедитора.
 */

import { prisma } from "@ltex/db";

/** Рядок-сирець МЛ для перевірки незакритого кілометражу. */
export interface UnclosedMileageRow {
  id: string;
  docNumber: number;
  code1C: string | null;
  status: string;
  mileageStartKm: number | null;
  mileageEndKm: number | null;
}

/**
 * Чи є цей МЛ «незакритим» (для попередження):
 *   - статус ще не `completed` (день не завершено), АБО
 *   - проставлено початковий кілометраж, але не проставлено кінцевий.
 *
 * Pure — над уже завантаженим рядком (зручно для unit-тестів).
 */
export function isUnclosedMileage(row: {
  status: string;
  mileageStartKm: number | null;
  mileageEndKm: number | null;
}): boolean {
  const notCompleted = row.status !== "completed";
  const startedNotClosed =
    row.mileageStartKm != null && row.mileageEndKm == null;
  return notCompleted || startedNotClosed;
}

/** Людський номер МЛ для повідомлення. */
function rowLabel(row: UnclosedMileageRow): string {
  return `№${row.code1C ?? row.docNumber}`;
}

/**
 * Перевіряє, чи має експедитор інший (id ≠ current) маршрутний лист, що є
 * незакритим (`isUnclosedMileage`). Якщо так — повертає текст попередження;
 * інакше `null`.
 *
 * Без `expeditorUserId` (експедитор не призначений) — попередження немає.
 */
export async function getUnclosedMileageWarning(
  expeditorUserId: string | null | undefined,
  currentSheetId: string,
): Promise<string | null> {
  if (!expeditorUserId) return null;

  const others = await prisma.routeSheet.findMany({
    where: {
      expeditorUserId,
      id: { not: currentSheetId },
    },
    orderBy: { date: "desc" },
    take: 50,
    select: {
      id: true,
      docNumber: true,
      code1C: true,
      status: true,
      mileageStartKm: true,
      mileageEndKm: true,
    },
  });

  const unclosed = others.filter((r) => isUnclosedMileage(r));
  if (unclosed.length === 0) return null;

  const labels = unclosed.slice(0, 3).map(rowLabel).join(", ");
  const more = unclosed.length > 3 ? ` та ще ${unclosed.length - 3}` : "";
  return `Немає кінцевого кілометражу за попередню зміну! Незакриті маршрутні листи цього експедитора: ${labels}${more}.`;
}
