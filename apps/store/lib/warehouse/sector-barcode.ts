import { prisma, type PrismaClient } from "@ltex/db";

/**
 * Наступний вільний код сектора `SEC` + 6-значний номер (Code128-friendly).
 * Продовжує наявну нумерацію (max+1). Чиста функція — для тесту.
 */
export function nextSectorBarcode(
  existing: readonly (string | null)[],
): string {
  let max = 0;
  for (const b of existing) {
    const m = b?.match(/^SEC(\d+)$/);
    if (m && m[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  return `SEC${String(max + 1).padStart(6, "0")}`;
}

/**
 * Генератор штрихкоду сектора складу. Унікальний індекс `barcode` гарантує
 * цілісність; при рідкій гонці caller повторює.
 */
export async function generateSectorBarcode(
  db: PrismaClient = prisma,
): Promise<string> {
  const rows = await db.warehouseSector.findMany({
    where: { barcode: { startsWith: "SEC" } },
    select: { barcode: true },
  });
  return nextSectorBarcode(rows.map((r) => r.barcode));
}
