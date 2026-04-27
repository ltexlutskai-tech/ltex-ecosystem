/**
 * Inlined label/option maps mirroring @ltex/shared.
 *
 * The mobile-client app is intentionally excluded from the pnpm workspace
 * (Expo + Metro have their own dependency resolution), so it cannot import
 * from `@ltex/shared`. Keep these in sync with:
 *   - packages/shared/src/constants/quality.ts (QUALITY_LEVELS, QUALITY_LABELS)
 *   - packages/shared/src/constants/business.ts (COUNTRIES, COUNTRY_LABELS)
 *   - packages/shared/src/types/product.ts (SEASONS, SEASON_LABELS)
 */

export const QUALITY_LEVELS = [
  "extra",
  "cream",
  "first",
  "second",
  "stock",
  "mix",
] as const;

export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export const QUALITY_LABELS: Record<string, string> = {
  extra: "Екстра",
  cream: "Крем",
  first: "1й сорт",
  second: "2й сорт",
  stock: "Сток",
  mix: "Мікс",
};

export const SEASONS = ["winter", "summer", "demiseason"] as const;
export type Season = (typeof SEASONS)[number];

export const SEASON_LABELS: Record<string, string> = {
  winter: "Зима",
  summer: "Літо",
  demiseason: "Демісезон",
  "": "Всесезон",
};

export const COUNTRIES = ["england", "germany", "canada", "poland"] as const;
export type Country = (typeof COUNTRIES)[number];

export const COUNTRY_LABELS: Record<string, string> = {
  england: "Англія",
  germany: "Німеччина",
  canada: "Канада",
  poland: "Польща",
};

/**
 * 2-letter alpha codes for compact UI chips.
 * Maps mobile-friendly short codes back to the full keys used by the API.
 */
export const COUNTRY_SHORT: Record<string, string> = {
  england: "GB",
  germany: "DE",
  canada: "CA",
  poland: "PL",
};

export const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "За замовч." },
  { key: "price_asc", label: "Ціна ↑" },
  { key: "price_desc", label: "Ціна ↓" },
  { key: "name_asc", label: "А–Я" },
  { key: "newest", label: "Новизна" },
];
