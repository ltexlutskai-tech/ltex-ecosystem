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
  phonePrimary: string | null;
  city: string | null;
  region: string | null;
  street: string | null;
  house: string | null;
  novaPoshtaBranch: string | null;
  websiteUrl: string | null;
  monthlyVolume: string | null;
  licenseExpiresAt: string | null;
  isOwn: boolean;
  debt: string;
  overdueDebt: string;
  daysSinceLastPurchase: number | null;
  lastPurchaseAt: string | null;
  hasNewMessage: boolean;
  isViberLinked: boolean;
  dialogStatus: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
  statusGeneral: ClientStatusDto | null;
  statusOperational: ClientStatusDto | null;
  searchChannel: ClientDictionaryRef | null;
  categoryTT: ClientDictionaryRef | null;
  deliveryMethod: ClientDictionaryRef | null;
  primaryAssortment: ClientDictionaryRef | null;
  primaryRoute: { id: string; name: string } | null;
  phones: ClientPhone[];
  messengers: ClientMessenger[];
  warehouses: ClientWarehouse[];
  routes: ClientRouteRef[];
  assortmentItems: ClientAssortmentItem[];
  timeline: ClientTimelineEntry[];
  assignedManager: { id: string; fullName: string } | null;
}
