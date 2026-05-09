/**
 * Inlined label/option maps mirroring @ltex/shared.
 *
 * The mobile-client app is intentionally excluded from the pnpm workspace
 * (Expo + Metro have their own dependency resolution), so it cannot import
 * from `@ltex/shared`. Keep these in sync with:
 *   - packages/shared/src/constants/quality.ts (QUALITY_LEVELS, QUALITY_LABELS)
 *   - packages/shared/src/constants/business.ts (COUNTRIES, COUNTRY_LABELS,
 *     GENDER_OPTIONS, UA_REGIONS)
 *   - packages/shared/src/constants/categories.ts (OVERSIZE_SLUG)
 *   - packages/shared/src/types/product.ts (SEASONS, SEASON_LABELS)
 */

export const QUALITY_LEVELS = [
  "extra",
  "cream",
  "first",
  "second",
  "stock",
  "mix",
  "extra_first",
  "extra_cream",
  "first_second",
] as const;

export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export const QUALITY_LABELS: Record<string, string> = {
  extra: "Екстра",
  cream: "Крем",
  first: "1й сорт",
  second: "2й сорт",
  stock: "Сток",
  mix: "Мікс",
  extra_first: "Екстра / 1й сорт",
  extra_cream: "Екстра / Крем",
  first_second: "1й / 2й сорт",
};

export const SEASONS = [
  "winter",
  "summer",
  "demiseason",
  "all_season",
] as const;
export type Season = (typeof SEASONS)[number];

export const SEASON_LABELS: Record<string, string> = {
  winter: "Зима",
  summer: "Літо",
  demiseason: "Демісезон",
  all_season: "Всесезонне",
  "": "—",
};

export const COUNTRIES = [
  "england",
  "germany",
  "canada",
  "poland",
  "scotland",
  "usa",
] as const;
export type Country = (typeof COUNTRIES)[number];

export const COUNTRY_LABELS: Record<string, string> = {
  england: "Англія",
  germany: "Німеччина",
  canada: "Канада",
  poland: "Польща",
  scotland: "Шотландія",
  usa: "США",
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
  scotland: "SC",
  usa: "US",
};

/**
 * Gender values stored on Product as raw Ukrainian strings — mirrored from
 * `@ltex/shared` `GENDER_OPTIONS`. The catalog API filters by exact match.
 */
export const GENDER_OPTIONS = [
  "Жіноча",
  "Чоловіча",
  "Дитяча",
  "Унісекс",
  "Дорослий",
] as const;
export type Gender = (typeof GENDER_OPTIONS)[number];

/**
 * Regions of Ukraine — 24 oblasts + AR Crimea + 2 cities of special status.
 * Used for the "Область" picker on the customer login form. Stored on
 * `Customer.city` (free-text in DB; UI offers this fixed list).
 */
export const UA_REGIONS = [
  "Вінницька",
  "Волинська",
  "Дніпропетровська",
  "Донецька",
  "Житомирська",
  "Закарпатська",
  "Запорізька",
  "Івано-Франківська",
  "Київська",
  "Кіровоградська",
  "Луганська",
  "Львівська",
  "Миколаївська",
  "Одеська",
  "Полтавська",
  "Рівненська",
  "Сумська",
  "Тернопільська",
  "Харківська",
  "Херсонська",
  "Хмельницька",
  "Черкаська",
  "Чернівецька",
  "Чернігівська",
  "АР Крим",
  "м. Київ",
  "м. Севастополь",
] as const;
export type UaRegion = (typeof UA_REGIONS)[number];

/**
 * Cross-cutting subcategory slug for "великі розміри" (XXL+) — matches all
 * products with `isOversize=true` regardless of their parent category.
 */
export const OVERSIZE_SLUG = "xxl-veliki-rozmiry";
export const OVERSIZE_LABEL = "Великі розміри (XXL+)";

export const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "За замовч." },
  { key: "price_asc", label: "Ціна ↑" },
  { key: "price_desc", label: "Ціна ↓" },
  { key: "name_asc", label: "А–Я" },
  { key: "newest", label: "Новизна" },
];
