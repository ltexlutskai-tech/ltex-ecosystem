export const LOT_STATUSES = ["free", "reserved", "on_sale"] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export const LOT_STATUS_LABELS: Record<LotStatus, string> = {
  free: "Вільний",
  reserved: "Зарезервований",
  on_sale: "Акція",
};

export interface Lot {
  id: string;
  productId: string;
  barcode: string;
  weight: number;
  quantity: number;
  status: LotStatus;
  priceEur: number;
  videoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
