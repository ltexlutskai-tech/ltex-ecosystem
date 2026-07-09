import type { PrismaClient } from "@ltex/db";

/**
 * Очищення покинутих чернеток (План AUTOSAVE_REALTIME_PLAN §3).
 *
 * Наскрізне autosave створює документи у стані `status="draft"`. Якщо чернетку
 * покинули (закрили вкладку, передумали) — вона лишається в БД і засмічує
 * списки. Цей модуль прибирає ЛИШЕ **порожні** чернетки, старші за N днів
 * (за замовч. 14): для документів з рядками — ті, що не мають жодного рядка;
 * для шапкових — ті, що не мають ключових полів/сум.
 *
 * Непорожні чернетки (з рядками/сумами) НЕ чіпаються — у них є реальні дані.
 * Рядки видаляються каскадом (усі `*Item.document` мають `onDelete: Cascade`),
 * тож видаляти доводиться лише порожні шапки.
 */

const DEFAULT_OLDER_THAN_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Чисте ядро ─────────────────────────────────────────────────────────────

export interface DraftEmptinessInput {
  /** Кількість рядків документа (для документів із табличною частиною). */
  itemCount?: number;
  /** Чи присутні ключові поля/суми (для шапкових документів). */
  hasKeyData?: boolean;
}

/**
 * Класифікація «порожня чернетка» (безпечна до авто-видалення). Чиста функція.
 *
 * - Документ із рядками: порожній ⇔ немає рядків (`itemCount === 0`).
 * - Шапковий документ: порожній ⇔ немає ключових полів (`hasKeyData !== true`).
 */
export function isEmptyDraft(input: DraftEmptinessInput): boolean {
  if (input.itemCount !== undefined) return input.itemCount === 0;
  return input.hasKeyData !== true;
}

/** Гранична дата: усе, що оновлювалось раніше — «покинуте». Чиста функція. */
export function draftCutoffDate(now: Date, olderThanDays: number): Date {
  return new Date(now.getTime() - olderThanDays * MS_PER_DAY);
}

// ─── I/O ────────────────────────────────────────────────────────────────────

/** Лічильники видалених чернеток по типах документів. */
export type AbandonedDraftCounts = Record<string, number> & { total?: number };

/**
 * Видаляє порожні покинуті чернетки по всіх моделях-документах. Повертає
 * лічильники по типах + `total`. `db` — Prisma client (DI для тестів).
 */
export async function deleteAbandonedDrafts(
  db: PrismaClient,
  olderThanDays: number = DEFAULT_OLDER_THAN_DAYS,
  now: Date = new Date(),
): Promise<AbandonedDraftCounts> {
  const cutoff = draftCutoffDate(now, olderThanDays);
  const draftBase = { status: "draft", updatedAt: { lt: cutoff } };
  const emptyItems = { none: {} };
  const counts: AbandonedDraftCounts = {};

  // ── Документи з рядками — «порожній» = немає рядків ──
  counts.sale = (
    await db.sale.deleteMany({ where: { ...draftBase, items: emptyItems } })
  ).count;
  counts.order = (
    await db.order.deleteMany({ where: { ...draftBase, items: emptyItems } })
  ).count;
  counts.receiving = (
    await db.receiving.deleteMany({
      where: { ...draftBase, items: emptyItems },
    })
  ).count;
  counts.productReturnFromCustomer = (
    await db.productReturnFromCustomer.deleteMany({
      where: { ...draftBase, items: emptyItems },
    })
  ).count;
  counts.warehouseReturn = (
    await db.warehouseReturn.deleteMany({
      where: { ...draftBase, items: emptyItems },
    })
  ).count;
  counts.returnToSupplier = (
    await db.returnToSupplier.deleteMany({
      where: { ...draftBase, items: emptyItems },
    })
  ).count;
  counts.repacking = (
    await db.repacking.deleteMany({
      where: { ...draftBase, items: emptyItems },
    })
  ).count;
  counts.writeOff = (
    await db.writeOff.deleteMany({ where: { ...draftBase, items: emptyItems } })
  ).count;
  counts.stockAdjustment = (
    await db.stockAdjustment.deleteMany({
      where: { ...draftBase, items: emptyItems },
    })
  ).count;
  counts.inventory = (
    await db.inventory.deleteMany({
      where: { ...draftBase, items: emptyItems },
    })
  ).count;
  counts.stockTransfer = (
    await db.stockTransfer.deleteMany({
      where: { ...draftBase, items: emptyItems },
    })
  ).count;
  counts.bagStateChange = (
    await db.bagStateChange.deleteMany({
      where: { ...draftBase, items: emptyItems },
    })
  ).count;

  // ── Маршрутний лист — «порожній» = немає ані замовлень, ані рядків ──
  counts.routeSheet = (
    await db.routeSheet.deleteMany({
      where: { ...draftBase, orders: { none: {} }, items: { none: {} } },
    })
  ).count;

  // ── Шапкові документи (без рядків) — «порожній» = немає ключових полів/сум ──
  counts.mgrCashOrder = (
    await db.mgrCashOrder.deleteMany({
      where: {
        ...draftBase,
        saleId: null,
        customerId: null,
        amountUah: 0,
        amountEur: 0,
        amountUsd: 0,
        amountUahCashless: 0,
      },
    })
  ).count;
  counts.bankPaymentIncoming = (
    await db.bankPaymentIncoming.deleteMany({
      where: { ...draftBase, amount: 0, customerId: null },
    })
  ).count;
  counts.bankPaymentOutgoing = (
    await db.bankPaymentOutgoing.deleteMany({
      where: { ...draftBase, amount: 0, customerId: null },
    })
  ).count;
  counts.cashTransfer = (
    await db.cashTransfer.deleteMany({
      where: { ...draftBase, amount: 0 },
    })
  ).count;

  counts.total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return counts;
}
