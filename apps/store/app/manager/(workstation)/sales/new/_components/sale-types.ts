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
  exportTo1C: boolean;
  expressWaybill: string | null;
  items: SaleItemDraft[];
}
