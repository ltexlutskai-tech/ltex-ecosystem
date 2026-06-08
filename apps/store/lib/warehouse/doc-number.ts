import { prisma } from "@ltex/db";

/**
 * Генератор номера документа поступлення.
 * Паттерн: `LT-RCV-YYYYMM-NNNN`, де NNNN — порядковий номер у межах місяця.
 *
 * Узгоджено з user 2026-06-03 (роби як у 1С) — 1С теж має місячні нумератори
 * за документ-типом. Тут спрощено до одного префіксу для warehouse, бо у
 * нас зараз один тип документа.
 */
export async function generateReceivingDocNumber(
  date: Date = new Date(),
): Promise<string> {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `LT-RCV-${yyyy}${mm}-`;

  // Найбільший seq у поточному місяці.
  const existing = await prisma.receiving.findMany({
    where: { docNumber: { startsWith: prefix } },
    select: { docNumber: true },
  });

  let maxSeq = 0;
  for (const r of existing) {
    const m = r.docNumber.match(new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`));
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (n > maxSeq) maxSeq = n;
    }
  }

  // Інкрементуємо + захист від race (повторюємо до 5 разів).
  for (let attempt = 0; attempt < 5; attempt++) {
    const seq = maxSeq + 1 + attempt;
    const candidate = `${prefix}${String(seq).padStart(4, "0")}`;
    const collision = await prisma.receiving.findUnique({
      where: { docNumber: candidate },
      select: { id: true },
    });
    if (!collision) return candidate;
  }
  throw new Error(`Не вдалося згенерувати номер документа після 5 спроб`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
