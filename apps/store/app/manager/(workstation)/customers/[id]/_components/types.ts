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

export interface ClientDetail {
  id: string;
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
