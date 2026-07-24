export type { ConfigItem } from "@/lib/manager/view-defaults";
export type { ClientColor } from "@/lib/manager/client-color";
import type { ClientColor } from "@/lib/manager/client-color";

export interface DictionaryRef {
  code: string;
  label: string;
}

export interface DictionaryRefWithColor {
  code: string;
  label: string;
  colorHex: string;
}

export interface ClientListItem {
  id: string;
  code1C: string | null;
  /**
   * `Customer.id` (дзеркало по code1C) для швидких дій із контекстного меню
   * (Створити замовлення/реалізацію чекають Customer.id у `?clientId`). null,
   * якщо дзеркала ще немає — дії відкриють форму з порожнім пікером.
   */
  customerId: string | null;
  name: string;
  tradePointName?: string | null;
  phonePrimary: string | null;
  city: string | null;
  region: string | null;
  debt: string;
  overdueDebt: string;
  monthlyVolume?: string | null;
  daysSinceLastPurchase: number | null;
  lastPurchaseAt: string | null;
  keywords?: string | null;
  licenseExpiresAt?: string | null;
  lastSyncedAt?: string | null;
  createdAt?: string;
  statusGeneral: DictionaryRefWithColor | null;
  statusOperational: DictionaryRefWithColor | null;
  searchChannel: DictionaryRef | null;
  deliveryMethod: DictionaryRef | null;
  categoryTT?: DictionaryRef | null;
  priceType?: DictionaryRef | null;
  primaryAssortment?: DictionaryRef | null;
  primaryRoute?: DictionaryRef | null;
  agent?: { id: string; fullName: string } | null;
  assignedManager: { id: string; fullName: string } | null;
  /** Світлофор пріоритету (авто, з давності контакту + активних замовлень). */
  color: ClientColor;
  /** Момент останньої взаємодії (max timeline.occurredAt) або null. */
  lastContactAt: string | null;
  /**
   * Непрочитані повідомлення клієнта в об'єднаному месенджері (сума
   * `unreadForManager` по його розмовах). >0 → синій індикатор у списку.
   * ОКРЕМИЙ від світлофора пріоритету — це індикатор саме нового повідомлення.
   */
  unreadMessageCount: number;
  /**
   * Є вільний текст «Відділення НП», але адресу ще не звірено зі структурованим
   * довідником НП (`npAddressMatchedAt == null`) — менеджеру варто виправити.
   */
  npNotMatched: boolean;
}

export interface DictionaryOption {
  code: string;
  label: string;
}

export interface DictionaryOptionWithId {
  id: string;
  code: string;
  label: string;
}

export interface DictionariesSnapshot {
  statuses: Array<{
    id: string;
    code: string;
    label: string;
    colorHex: string;
  }>;
  statusesOperational: Array<{
    id: string;
    code: string;
    label: string;
    colorHex: string;
  }>;
  channels: DictionaryOptionWithId[];
  deliveries: DictionaryOptionWithId[];
  categoriesTT: DictionaryOptionWithId[];
  priceTypes: DictionaryOptionWithId[];
  assortmentCodes: DictionaryOptionWithId[];
  routes: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; fullName: string }>;
  /** Distinct значення для фільтрів «Область» / «Місто». */
  regions: string[];
  cities: string[];
}
