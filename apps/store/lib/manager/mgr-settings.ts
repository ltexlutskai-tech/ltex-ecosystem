import { prisma } from "@ltex/db";

/**
 * Key-value налаштування менеджерки (модель `MgrSetting`). Наразі єдиний ключ —
 * допуск різниці ваги при перепаковці. Читання з дефолтом, запис через upsert.
 */

export const REPACK_WEIGHT_TOLERANCE_KEY = "repack.weight_tolerance_kg";
export const DEFAULT_REPACK_WEIGHT_TOLERANCE_KG = 2;

/** Парсить рядок налаштування у невід'ємне число (fallback на дефолт). */
export function parseWeightTolerance(
  value: string | null | undefined,
  fallback: number = DEFAULT_REPACK_WEIGHT_TOLERANCE_KG,
): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Допуск ваги при перепаковці (кг). Дефолт = 2. */
export async function getRepackWeightTolerance(): Promise<number> {
  const row = await prisma.mgrSetting.findUnique({
    where: { key: REPACK_WEIGHT_TOLERANCE_KEY },
  });
  return parseWeightTolerance(row?.value);
}

/** Записати допуск ваги при перепаковці (кг). */
export async function setRepackWeightTolerance(kg: number): Promise<void> {
  const value = String(kg);
  await prisma.mgrSetting.upsert({
    where: { key: REPACK_WEIGHT_TOLERANCE_KEY },
    create: { key: REPACK_WEIGHT_TOLERANCE_KEY, value },
    update: { value },
  });
}
