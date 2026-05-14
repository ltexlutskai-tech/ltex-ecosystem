export type { ConfigItem } from "@/lib/manager/view-defaults";

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
}
