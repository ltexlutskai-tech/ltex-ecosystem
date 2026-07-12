/**
 * Інвентаризація товарів на складі — чисті хелпери (без БД/React).
 *
 * Модель L-TEX: склад = мішки (Lot) з унікальним ШК. Тому інвентаризація
 * ведеться ПО МІШКАХ (кожен рядок = мішок), а не агрегованою кількістю як у 1С:
 *   • «Облік» (`qtyAccounting`) — чи мішок рахується на складі за системою (1/0);
 *   • «Факт»  (`qtyActual`)     — чи мішок фактично знайдено/відскановано (1/0);
 *   • «Відхилення» = Факт − Облік:
 *       +1 → надлишок (є фізично, нема в обліку),
 *       −1 → нестача  (є в обліку, не знайдено),
 *        0 → збіг.
 *
 * Сам документ залишків НЕ рухає — це звірка. Нестачу списують, а надлишок
 * оприбутковують ОКРЕМИМИ документами «на підставі інвентаризації».
 */

/** Рядок інвентаризації у формі (клієнтський стан). */
export interface InvRow {
  key: string;
  lotId: string | null;
  productId: string | null;
  productName: string;
  articleCode: string;
  barcode: string;
  sector: string;
  quality: string;
  weight: number;
  unitName: string;
  priceEur: number;
  qtyAccounting: number;
  qtyActual: number;
}

/** Мішок зі складу (знімок для «Заповнити зі складу» / скану ШК). */
export interface WarehouseLot {
  lotId: string;
  barcode: string;
  productId: string | null;
  productName: string;
  articleCode: string | null;
  weight: number;
  quantity: number;
  priceEur: number;
  sector: string | null;
  unitName: string;
  quality: string | null;
}

export type RowStatus = "matched" | "missing" | "surplus" | "empty";

/** Сектор складу (довідник) з опційним ШК. */
export interface SectorRef {
  id: string;
  name: string;
  barcode: string | null;
}

/**
 * Рядок інвентаризації у server-authoritative режимі (спільна робота).
 * Пласка серіалізовна форма — спільна для клієнта й сервера (без Prisma).
 */
export interface LiveItem {
  id: string;
  lotId: string | null;
  productId: string | null;
  productName: string;
  articleCode: string;
  barcode: string;
  sector: string;
  sectorId: string | null;
  weight: number;
  unitName: string;
  priceEur: number;
  qtyAccounting: number;
  qtyActual: number;
  foundByName: string | null;
  updatedAt: string;
}

export interface LiveDoc {
  id: string;
  docNumber: string;
  number1C: string | null;
  docDate: string;
  notes: string;
  status: string;
  items: LiveItem[];
  serverTime: string;
}

/** Людська назва одиниці виміру за `Product.priceUnit`. */
export function unitLabel(priceUnit: string | null | undefined): string {
  switch (priceUnit) {
    case "kg":
      return "кг";
    case "piece":
      return "шт";
    case "pair":
      return "пар";
    case "liter":
      return "л";
    default:
      return priceUnit || "шт";
  }
}

/** Статус рядка за обліком/фактом. */
export function rowStatus(row: {
  qtyAccounting: number;
  qtyActual: number;
}): RowStatus {
  const acc = row.qtyAccounting > 0;
  const act = row.qtyActual > 0;
  if (acc && act) return "matched";
  if (!acc && act) return "surplus";
  if (acc && !act) return "missing";
  return "empty";
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface InvSummary {
  /** Усього рядків (найменувань/мішків). */
  rows: number;
  /** Відскановано/знайдено (Факт>0). */
  found: number;
  /** Збіг (є в обліку і знайдено). */
  matched: number;
  /** Нестача (є в обліку, не знайдено). */
  missing: number;
  /** Надлишок (знайдено, нема в обліку). */
  surplus: number;
  /** Σ вага обліку (кг). */
  accWeight: number;
  /** Σ вага факт (кг). */
  actWeight: number;
  /** Вага нестач (кг). */
  missingWeight: number;
  /** Вага надлишків (кг). */
  surplusWeight: number;
  /** Σ сума факт (€). */
  actAmountEur: number;
}

/** Зведення по рядках інвентаризації. Чиста функція. */
export function summarizeInventory(
  rows: readonly Pick<
    InvRow,
    "qtyAccounting" | "qtyActual" | "weight" | "priceEur"
  >[],
): InvSummary {
  const s: InvSummary = {
    rows: 0,
    found: 0,
    matched: 0,
    missing: 0,
    surplus: 0,
    accWeight: 0,
    actWeight: 0,
    missingWeight: 0,
    surplusWeight: 0,
    actAmountEur: 0,
  };
  for (const r of rows) {
    const st = rowStatus(r);
    if (st === "empty") continue;
    s.rows += 1;
    if (r.qtyActual > 0) {
      s.found += 1;
      s.actWeight += r.weight || 0;
      s.actAmountEur += (r.priceEur || 0) * r.qtyActual;
    }
    if (r.qtyAccounting > 0) s.accWeight += r.weight || 0;
    if (st === "matched") s.matched += 1;
    else if (st === "missing") {
      s.missing += 1;
      s.missingWeight += r.weight || 0;
    } else if (st === "surplus") {
      s.surplus += 1;
      s.surplusWeight += r.weight || 0;
    }
  }
  s.accWeight = round1(s.accWeight);
  s.actWeight = round1(s.actWeight);
  s.missingWeight = round1(s.missingWeight);
  s.surplusWeight = round1(s.surplusWeight);
  s.actAmountEur = round2(s.actAmountEur);
  return s;
}

/** Мапить мішок зі складу у рядок «облік=1, факт=0» (для «Заповнити зі складу»). */
export function warehouseLotToRow(lot: WarehouseLot, key: string): InvRow {
  return {
    key,
    lotId: lot.lotId,
    productId: lot.productId,
    productName: lot.productName,
    articleCode: lot.articleCode ?? "",
    barcode: lot.barcode,
    sector: lot.sector ?? "",
    quality: lot.quality ?? "",
    weight: lot.weight,
    unitName: lot.unitName,
    priceEur: lot.priceEur,
    qtyAccounting: 1,
    qtyActual: 0,
  };
}

/** Індекс рядка за ШК (порожній ШК не матчиться). −1 якщо нема. */
export function findRowIndexByBarcode(
  rows: readonly InvRow[],
  barcode: string,
): number {
  const code = barcode.trim();
  if (!code) return -1;
  return rows.findIndex((r) => r.barcode.trim() === code);
}
