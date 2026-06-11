export interface ClientStatusDto {
  code: string;
  label: string;
  colorHex: string;
}

export interface ClientDictionaryRef {
  code: string;
  label: string;
}

export interface ClientPhone {
  id: string;
  phone: string;
  label: string | null;
  messenger: string | null;
}

export interface ClientMessenger {
  id: string;
  network: string;
  handle: string;
  url: string | null;
  browserUrl: string | null;
  comment: string | null;
}

export interface ClientWarehouse {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  novaPoshtaBranch: string | null;
  licenseExpiresAt: string | null;
  comment: string | null;
}

export interface ClientRouteRef {
  id: string;
  routeId: string;
  name: string;
  isActive: boolean;
}

export interface ClientAssortmentItem {
  id: string;
  productCode: string;
  productName: string | null;
  lastOrderedAt: string | null;
  notDirectInput: boolean;
}

export interface ClientPresentationItem {
  id: string;
  productCode: string;
  productName: string | null;
  lastPresentedAt: string | null;
  notDirectInput: boolean;
}

export interface ClientBankAccount {
  id: string;
  accountNumber: string;
  bankName: string | null;
  mfo: string | null;
  comment: string | null;
  isHidden: boolean;
}

export interface ClientReminder {
  id: string;
  body: string;
  remindAt: string;
  completedAt: string | null;
  snoozedUntilAt: string | null;
  createdAt: string;
  owner: { id: string; fullName: string } | null;
}

export interface ClientTimelineEntry {
  id: string;
  kind: string;
  body: string;
  occurredAt: string;
  author: { id: string; fullName: string } | null;
  metadata: unknown;
}

/**
 * Власник клієнта з точки зору поточного користувача:
 * - `admin` — admin role (бачить усе)
 * - `mine` — клієнт призначений на мене (повний доступ + редагування)
 * - `foreign` — чужий клієнт (masked контакти, hidden tabs)
 *
 * Серверне поле, передається з GET `/clients/[id]` та з server-side
 * loader-а. UI використовує для conditional rendering.
 */
export type ViewerOwnership = "mine" | "foreign" | "admin";

export interface ClientDetail {
  id: string;
  /**
   * Власник клієнта з точки зору поточного користувача (server-set).
   * Server вже застосував masking коли `foreign` — це лише hint для UI
   * (банер, hidden tabs, disabled edit button).
   */
  viewerOwnership: ViewerOwnership;
  code1C: string | null;
  name: string;
  tradePointName: string | null;
  phonePrimary: string | null;
  viberContact: string | null;
  city: string | null;
  region: string | null;
  street: string | null;
  house: string | null;
  novaPoshtaBranch: string | null;
  geolocation: string | null;
  websiteUrl: string | null;
  monthlyVolume: string | null;
  licenseExpiresAt: string | null;
  isOwn: boolean;
  email: string | null;
  legalType: string | null;
  inn: string | null;
  edrpou: string | null;
  fullName: string | null;
  comment: string | null;
  additionalDescription: string | null;
  workingHours: string | null;
  parentCode1C: string | null;
  debt: string;
  overdueDebt: string;
  tovDebt: string | null;
  tovOverdueDebt: string | null;
  sessionRemainder: string | null;
  daysSinceLastPurchase: number | null;
  lastPurchaseAt: string | null;
  hasNewMessage: boolean;
  isViberLinked: boolean;
  dialogStatus: string | null;
  /** Ключові слова (теги через кому) — для пошуку/фільтра у списку клієнтів. */
  keywords: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
  statusGeneral: ClientStatusDto | null;
  statusGeneralId: string | null;
  statusOperational: ClientStatusDto | null;
  statusOperationalId: string | null;
  searchChannel: ClientDictionaryRef | null;
  searchChannelId: string | null;
  categoryTT: ClientDictionaryRef | null;
  categoryTTId: string | null;
  deliveryMethod: ClientDictionaryRef | null;
  deliveryMethodId: string | null;
  primaryAssortment: ClientDictionaryRef | null;
  primaryAssortmentId: string | null;
  priceType: ClientDictionaryRef | null;
  priceTypeId: string | null;
  primaryRoute: { id: string; name: string } | null;
  primaryRouteId: string | null;
  agent: { id: string; fullName: string } | null;
  agentUserId: string | null;
  phones: ClientPhone[];
  messengers: ClientMessenger[];
  warehouses: ClientWarehouse[];
  routes: ClientRouteRef[];
  assortmentItems: ClientAssortmentItem[];
  presentations: ClientPresentationItem[];
  bankAccounts: ClientBankAccount[];
  reminders: ClientReminder[];
  timeline: ClientTimelineEntry[];
  assignedManager: { id: string; fullName: string } | null;
}
