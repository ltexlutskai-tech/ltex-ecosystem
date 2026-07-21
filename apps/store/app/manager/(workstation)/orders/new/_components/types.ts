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
  /** Сумарні активні замовлення на товар (Етап 1 блоку Замовлень), null коли
   *  не запрошувалось АБО активних претензій нема. */
  activeClaim?: {
    totalQuantity: number;
    totalWeight: number;
    ordersCount: number;
  } | null;
  /** Складський залишок (вільні лоти): кг / шт / кількість лотів. */
  stock?: {
    lots: number;
    weightKg: number;
    quantityPcs: number;
  } | null;
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
  /** Область/регіон клієнта — для шапки повідомлення реалізації. */
  region?: string | null;
  /** Телефон клієнта — для блоку «Контактні дані» у формі. */
  phone?: string | null;
  /** Адреса клієнта — для блоку «Контактні дані» у формі. */
  address?: string | null;
  debt: string;
  /** `MgrPriceType.id` клієнта (підтягується у select типу цін). */
  priceTypeId?: string | null;
  /**
   * `MgrDeliveryMethod.code` клієнта. У замовленні НЕ використовується (8.1 —
   * доставку прибрано), лишається для форми Реалізації, що ділить цей тип.
   */
  deliveryMethodCode?: string | null;
  /** № відділення Нової Пошти клієнта (використовується у Реалізації). */
  novaPoshtaBranch?: string | null;
  /**
   * Структуровані реф-и «звіреної» адреси НП (довідник НП) — форма Реалізації
   * підставляє їх авто у пікер міста/відділення. Порожні коли не звірено.
   */
  npCityRef?: string | null;
  npCityName?: string | null;
  npWarehouseRef?: string | null;
  npWarehouseName?: string | null;
  /** Чи звірено адресу НП клієнта (для підказки «не звірено» у формі). */
  npAddressMatched?: boolean;
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

/**
 * Варіант доставки (delivery|post|pickup). Використовується формою Реалізації,
 * що ділить цей модуль типів; у замовленні доставку прибрано (8.1).
 */
export interface OrderDeliveryOption {
  code: string;
  label: string;
}

export interface OrderItemDraft {
  uid: string;
  product: ProductSummary | null;
  /**
   * Конкретний лот у потоці підбору **не використовується** (центральна 1С не
   * приймає такий формат) — поле лишається для зворотної сумісності зі старими
   * замовленнями, але `bindToLot` завжди `false`, `lot` завжди `null` у нових.
   */
  lot: LotSummary | null;
  bindToLot: boolean;
  /** Кількість мішків (ціле ≥ 1). */
  quantity: number;
  /** Сумарна вага позиції, кг = середня вага мішка × кількість мішків. */
  weight: number;
  /** Сумарна ціна позиції, € = ціна за кг × вага. */
  priceEur: number;
  /** Ціна за кг (€) — для відображення/перерахунку рядка. */
  unitPriceEur: number;
  /** Підставлена ціна — акційна (для підсвічування рядка «Акція»). */
  isAkciya?: boolean;
}

export interface WireOrderItem {
  productId: string;
  lotId: string | null;
  weight: number;
  quantity: number;
  priceEur: number;
}

/**
 * Перетворює draft на payload рядка замовлення. `lotId` **завжди `null`** —
 * у замовлення пишемо лише загальні позиції (товар + кількість мішків),
 * центральна 1С не приймає конкретний лот.
 */
export function draftToWire(draft: OrderItemDraft): WireOrderItem | null {
  if (!draft.product) return null;
  return {
    productId: draft.product.id,
    lotId: null,
    weight: draft.weight,
    quantity: draft.quantity,
    priceEur: draft.priceEur,
  };
}

/**
 * Початкові значення замовлення для режиму редагування (Етап 2).
 * Передаються з server-page детального замовлення.
 */
export interface OrderEditInitial {
  id: string;
  /** Номер документа для відображення (code1C або короткий id). */
  displayNumber: string;
  status: string;
  /** Актуальність документа (1С «Статус заказа: Актуальне»). */
  isActual: boolean;
  notes: string;
  priceTypeId: string | null;
  overdueDays: number | null;
  cashOnDelivery: boolean;
  assignedAgentUserId: string | null;
  items: OrderItemDraft[];
}
