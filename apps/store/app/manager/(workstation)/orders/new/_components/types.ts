/**
 * Shared types для UI створення замовлення.
 *
 * `OrderItemDraft` — стан item-rows у формі (з product/lot autocomplete view).
 * `WireOrderItem` — payload що відправляється у POST /api/v1/manager/orders.
 */

export interface ProductPriceEntry {
  priceType: string;
  amount: number;
  currency: string;
}

export interface ProductSummary {
  id: string;
  code1C: string | null;
  articleCode: string | null;
  name: string;
  slug: string;
  priceUnit: string;
  averageWeight: number | null;
  inStock: boolean;
  /** Усі записи Price товара — для перерахунку ціни рядка за типом цін. */
  prices: ProductPriceEntry[];
}

export interface LotSummary {
  id: string;
  barcode: string;
  weight: number;
  quantity: number;
  priceEur: number;
  status: string;
}

export interface ClientPickerItem {
  id: string;
  code1C: string | null;
  name: string;
  tradePointName: string | null;
  city: string | null;
  debt: string;
  /** `MgrPriceType.id` клієнта (підтягується у select типу цін). */
  priceTypeId?: string | null;
  /** `MgrDeliveryMethod.code` клієнта (підтягується у select доставки). */
  deliveryMethodCode?: string | null;
  agent: { id: string; fullName: string } | null;
  isOwned: boolean;
}

/** Тип цін (з MgrPriceType) для select-а у формі. */
export interface PriceTypeOption {
  id: string;
  code: string;
  label: string;
}

/** Менеджер-агент для select «призначити продаж торговому». */
export interface AgentOption {
  id: string;
  fullName: string;
}

/** Варіант доставки замовлення (delivery|post|pickup). */
export interface OrderDeliveryOption {
  code: string;
  label: string;
}

export interface OrderItemDraft {
  uid: string;
  product: ProductSummary | null;
  lot: LotSummary | null;
  bindToLot: boolean;
  weight: number;
  quantity: number;
  priceEur: number;
}

export interface WireOrderItem {
  productId: string;
  lotId: string | null;
  weight: number;
  quantity: number;
  priceEur: number;
}

export function draftToWire(draft: OrderItemDraft): WireOrderItem | null {
  if (!draft.product) return null;
  return {
    productId: draft.product.id,
    lotId: draft.bindToLot ? (draft.lot?.id ?? null) : null,
    weight: draft.weight,
    quantity: draft.quantity,
    priceEur: draft.priceEur,
  };
}
