import type { QualityLevel } from "../constants/quality";
import type { Country } from "../constants/business";

export interface Product {
  id: string;
  code1C: string | null;
  name: string;
  slug: string;
  categorySlug: string;
  subcategorySlug: string;
  description: string;
  quality: QualityLevel;
  priceEur: number;
  weight: number;
  imageUrls: string[];
  videoUrl: string | null;
  country: Country;
  inStock: boolean;
  createdAt: Date;
  updatedAt: Date;
}
