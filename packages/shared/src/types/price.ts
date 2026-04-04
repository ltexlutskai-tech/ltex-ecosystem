import type { Currency } from "../constants/currency";

export interface ExchangeRate {
  id: string;
  currencyFrom: Currency;
  currencyTo: Currency;
  rate: number;
  date: Date;
  source: "1c" | "manual";
}

export const PRICE_TYPES = ["wholesale", "retail", "akciya"] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  wholesale: "Оптова",
  retail: "Роздрібна",
  akciya: "Акція",
};

export interface Price {
  id: string;
  productId: string;
  priceType: PriceType;
  currency: Currency;
  amount: number;
  validFrom: Date;
  validTo: Date | null;
}
