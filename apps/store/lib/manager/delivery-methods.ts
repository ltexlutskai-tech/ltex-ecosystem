import { cache } from "react";
import { prisma } from "@ltex/db";
import { ORDER_DELIVERY_METHODS } from "./order-delivery";

/**
 * Способи доставки для документів (Замовлення/Реалізація) — з редагованого
 * довідника «Способи доставки» (`MgrDeliveryMethod`, /manager/dictionaries/
 * delivery-methods). У `Order.deliveryMethod`/`Sale.deliveryMethod`
 * зберігається `code` запису довідника.
 *
 * Легасі: старі документи зберігають фіксовані коди delivery|post|pickup
 * (`ORDER_DELIVERY_METHODS`) — резолвер лейблів їх теж розуміє.
 */

export interface DeliveryMethodOption {
  code: string;
  label: string;
}

/** Опції для селекта у формах. Fallback на легасі-список, коли довідник порожній. */
export const getDeliveryMethodOptions = cache(
  async (): Promise<DeliveryMethodOption[]> => {
    const rows = await prisma.mgrDeliveryMethod.findMany({
      // ТЗ 8.0 B7: у формах не пропонуємо заархівовані / позначені способи.
      where: { archived: false, markedForDeletion: false },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: { code: true, label: true },
    });
    if (rows.length > 0) return rows;
    return ORDER_DELIVERY_METHODS.map((d) => ({
      code: d.code,
      label: d.label,
    }));
  },
);

/**
 * Резолвер лейблів для списків/карток/друку: довідник → легасі-коди →
 * сирий код (невідомий код показуємо як є, щоб не втрачати інформацію).
 */
export const getDeliveryLabelResolver = cache(
  async (): Promise<(code: string | null | undefined) => string> => {
    const rows = await prisma.mgrDeliveryMethod.findMany({
      select: { code: true, label: true },
    });
    const map = new Map(rows.map((r) => [r.code, r.label]));
    for (const d of ORDER_DELIVERY_METHODS) {
      if (!map.has(d.code)) map.set(d.code, d.label);
    }
    return (code) => (code ? (map.get(code) ?? code) : "—");
  },
);

/**
 * Коди «доставки транспортом» для авто-нагадувань по «висячих» замовленнях
 * (доставка → нагадуємо раз на 7 днів; пошта/самовивіз — раз на 3 дні).
 * Легасі-код `delivery` + записи довідника, чий лейбл містить «достав».
 */
export async function getDeliveryLikeCodes(): Promise<Set<string>> {
  const codes = new Set<string>(["delivery"]);
  try {
    const rows = await prisma.mgrDeliveryMethod.findMany({
      select: { code: true, label: true },
    });
    for (const r of rows) {
      if (r.label.toLowerCase().includes("достав")) codes.add(r.code);
    }
  } catch {
    // Довідник недоступний — лишаємо лише легасі-код.
  }
  return codes;
}
