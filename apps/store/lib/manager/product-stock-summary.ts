import { prisma } from "@ltex/db";
import { isActiveReservation } from "./lot-booking";

/** Складський залишок товару: вага (кг), кількість (шт/пар) і число лотів. */
export interface ProductStockSummary {
  /** Кількість вільних лотів (мішків). */
  lots: number;
  /** Сумарна вага вільних лотів, кг. */
  weightKg: number;
  /** Сумарна кількість вільних одиниць (шт/пар). */
  quantityPcs: number;
}

const EMPTY: ProductStockSummary = { lots: 0, weightKg: 0, quantityPcs: 0 };

/**
 * Складський залишок по товарах для вікна підбору. «Вільний» = лот зі
 * `status='free'` без активної броні (протермінована бронь трактується як
 * вільний, як і у решті прайсу). Повертає Map productId → {lots, weightKg,
 * quantityPcs}; товари без лотів отримують нулі.
 */
export async function computeStockSummaryByProduct(
  productIds: string[],
  now: Date = new Date(),
): Promise<Map<string, ProductStockSummary>> {
  const map = new Map<string, ProductStockSummary>();
  for (const id of productIds) map.set(id, { ...EMPTY });
  if (productIds.length === 0) return map;

  const lots = await prisma.lot.findMany({
    where: { productId: { in: productIds }, status: "free" },
    select: {
      productId: true,
      status: true,
      weight: true,
      quantity: true,
      reservedByUserId: true,
      reservedUntil: true,
    },
  });

  for (const lot of lots) {
    // Активна (не протермінована) бронь → лот не вільний, не рахуємо у залишок.
    if (isActiveReservation(lot, now)) continue;
    const entry = map.get(lot.productId);
    if (!entry) continue;
    entry.lots += 1;
    entry.weightKg += lot.weight ?? 0;
    entry.quantityPcs += lot.quantity ?? 0;
  }

  // Округлюємо вагу до грамів для акуратного показу.
  for (const entry of map.values()) {
    entry.weightKg = Math.round(entry.weightKg * 1000) / 1000;
  }
  return map;
}
