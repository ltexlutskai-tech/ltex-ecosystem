/**
 * Shared types для UI створення/редагування реалізації (Блок «Реалізація»).
 *
 * `SaleItemDraft` — стан item-rows у формі. На відміну від замовлення, кожен
 * рядок несе `pricePerKg` (ЦенаПродажиВес), опційний `lotId`/`barcode`
 * (заповнюються при скані ШК) та `priceEur` = pricePerKg × weight × quantity.
 *
 * `WireSaleItem` — payload рядка, що відправляється у POST/PATCH /sales.
 *
 * Деякі типи (ProductSummary/ClientPickerItem/PriceTypeOption/AgentOption/
 * OrderDeliveryOption) перевикористовуємо з замовлень — re-export, щоб
 * UI-компоненти підбору/клієнта працювали без дублювання.
 */

export type {
  ProductSummary,
  ProductPriceEntry,
  ClientPickerItem,
  PriceTypeOption,
  AgentOption,
  OrderDeliveryOption,
} from "../../../orders/new/_components/types";

/** Лот, резолвлений за ШК (для прив'язки рядка реалізації до конкретного мішка). */
export interface SaleLotSummary {
  id: string;
  barcode: string;
  weight: number;
  quantity: number;
  status: string;
  /** Бронь — для попередження «не моя бронь». */
  reservedByUserId: string | null;
  reservedByName: string | null;
  reservedUntil: string | null;
}

export interface SaleItemDraft {
  uid: string;
  /** Товар рядка (з підбору або резолву ШК). */
  product:
    | import("../../../orders/new/_components/types").ProductSummary
    | null;
  /** Конкретний лот (заповнюється при скані ШК; підбір через прайс → null). */
  lotId: string | null;
  /** Відсканований штрихкод (для довідки/повтору). */
  barcode: string | null;
  /** Кількість мішків (ціле ≥ 1). */
  quantity: number;
  /** Сумарна вага позиції, кг. */
  weight: number;
  /** Ціна за кг (€) — редагована. */
  pricePerKg: number;
  /** Сумарна ціна позиції, € = ціна за кг × вага × мішки. */
  priceEur: number;
  /** Підставлена ціна — акційна (для підсвічування рядка «Акція»). */
  isAkciya?: boolean;
}

export interface WireSaleItem {
  productId: string;
  lotId: string | null;
  barcode: string | null;
  pricePerKg: number;
  weight: number;
  quantity: number;
  priceEur: number;
}

/** Перерахунок сумарної ціни рядка: ціна за кг × вага × мішки (округлення до копійок). */
export function lineTotalEur(
  pricePerKg: number,
  weight: number,
  quantity: number,
): number {
  return Math.round(pricePerKg * weight * quantity * 100) / 100;
}

/**
 * Парсить рядок числового вводу (ціна/мішки) у число.
 *
 * Приймає крапку АБО кому як десятковий роздільник, прибирає пробіли, трактує
 * порожнє / частковий ввід («», «.», «0.») як 0 для розрахунку. Від'ємні та
 * нечислові — 0. Використовується інлайновим numeric-полем, щоб не «прилипав»
 * провідний нуль (Fix 5): поле тримає рядок, а сюди передається для калькуляцій.
 */
export function parseNumericInput(raw: string): number {
  const cleaned = raw.replace(/\s+/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "." || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Нормалізує рядок числового вводу для відображення: дозволяє порожнє та
 * частковий ввід, замінює кому на крапку, прибирає провідні нулі (окрім «0.»).
 * Не округлює — користувач може друкувати «0.05» по символах.
 */
export function sanitizeNumericText(raw: string): string {
  let v = raw.replace(",", ".");
  // Лишаємо лише цифри + одну крапку.
  v = v.replace(/[^\d.]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
  }
  // Прибираємо провідні нулі («07» → «7»), але лишаємо «0.5» та «0».
  v = v.replace(/^0+(?=\d)/, "");
  return v;
}

/**
 * Копіює ціну за кг з рядка `sourceUid` на **усі рядки того самого товару**
 * (за `product.id`) та перераховує `priceEur` кожного скопійованого рядка.
 * Mirrors 1С `ПовторитьЦену`. Чиста функція (без I/O) — покрита тестами.
 *
 * Якщо рядок-джерело не знайдено або у нього немає товару — повертає вхід без
 * змін. Рядки без товару (порожні чернетки) пропускаються.
 */
export function repeatPriceForProduct(
  items: SaleItemDraft[],
  sourceUid: string,
): SaleItemDraft[] {
  const source = items.find((i) => i.uid === sourceUid);
  if (!source || !source.product) return items;
  const productId = source.product.id;
  const unit = source.pricePerKg;
  return items.map((row) => {
    if (row.uid === sourceUid) return row;
    if (!row.product || row.product.id !== productId) return row;
    return {
      ...row,
      pricePerKg: unit,
      priceEur: lineTotalEur(unit, row.weight, row.quantity),
      isAkciya: source.isAkciya ?? false,
    };
  });
}

/**
 * Перетворює draft на payload рядка реалізації. На відміну від замовлення,
 * `lotId`/`barcode` зберігаються (скан ШК прив'язує до конкретного мішка).
 * Повертає `null` для рядків без товару (порожні чернетки авто-видаляються).
 */
export function draftToWire(draft: SaleItemDraft): WireSaleItem | null {
  if (!draft.product) return null;
  return {
    productId: draft.product.id,
    lotId: draft.lotId,
    barcode: draft.barcode,
    pricePerKg: draft.pricePerKg,
    weight: draft.weight,
    quantity: draft.quantity,
    priceEur: draft.priceEur,
  };
}

/**
 * Початкові значення реалізації для режиму редагування (Етап 2).
 * Передаються з server-page детальної реалізації.
 */
export interface SaleEditInitial {
  id: string;
  /** Номер документа для відображення (code1C або docNumber). */
  displayNumber: string;
  status: string;
  notes: string;
  priceTypeId: string | null;
  deliveryMethod: string | null;
  novaPoshtaBranch: string | null;
  cashOnDelivery: boolean;
  assignedAgentUserId: string | null;
  onTradeAgent: boolean;
  expressWaybill: string | null;
  items: SaleItemDraft[];
}
