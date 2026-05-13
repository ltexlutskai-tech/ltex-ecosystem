export interface ClientListItem {
  id: string;
  code1C: string | null;
  name: string;
  phonePrimary: string | null;
  city: string | null;
  region: string | null;
  debt: string;
  overdueDebt: string;
  daysSinceLastPurchase: number | null;
  lastPurchaseAt: string | null;
  statusGeneral: { code: string; label: string; colorHex: string } | null;
  statusOperational: { code: string; label: string; colorHex: string } | null;
  searchChannel: { code: string; label: string } | null;
  deliveryMethod: { code: string; label: string } | null;
  assignedManager: { id: string; fullName: string } | null;
}

export interface DictionaryOption {
  code: string;
  label: string;
}
