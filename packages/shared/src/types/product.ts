import type { QualityLevel } from "../constants/quality";
import type { Country } from "../constants/business";

export const PRICE_UNITS = ["kg", "piece"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const PRICE_UNIT_LABELS: Record<PriceUnit, string> = {
  kg: "€/кг",
  piece: "€/шт",
};

export const SEASONS = ["winter", "summer", "demiseason", ""] as const;
export type Season = (typeof SEASONS)[number];

export const SEASON_LABELS: Record<string, string> = {
  winter: "Зима",
  summer: "Літо",
  demiseason: "Демісезон",
  "": "Всесезон",
};

export interface Product {
  id: string;
  code1C: string | null;
  articleCode: string | null;
  name: string;
  slug: string;
  categorySlug: string;
  subcategorySlug: string;
  description: string;
  quality: QualityLevel;
  season: Season;
  priceUnit: PriceUnit;
  averageWeight: number | null;
  imageUrls: string[];
  videoUrl: string | null;
  country: Country | "";
  inStock: boolean;
  createdAt: Date;
  updatedAt: Date;
}
