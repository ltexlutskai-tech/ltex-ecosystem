import { prisma } from "@ltex/db";
import {
  QUALITY_LEVELS,
  QUALITY_LABELS,
  COUNTRIES,
  COUNTRY_LABELS,
  GENDER_OPTIONS,
  SEASONS,
  SEASON_LABELS,
} from "@ltex/shared";

/**
 * Опції характеристик товару (Якість/Країна/Стать/Сезон) для форми створення
 * товару та фільтрів сайту. Джерело — редаговані довідники
 * (`MgrQuality`/`MgrCountry`/`MgrGender`/`MgrSeason`); якщо довідник порожній
 * (напр. міграцію ще не прогнали) — fallback на спільні константи, щоб UI
 * ніколи не лишався без опцій.
 *
 * `value` = те, що зберігається у Product.quality/country/gender/season (code);
 * `label` = напис для користувача.
 */
export interface AttrOption {
  value: string;
  label: string;
}

export interface ProductAttributeOptions {
  quality: AttrOption[];
  countries: AttrOption[];
  genders: AttrOption[];
  seasons: AttrOption[];
}

const ACTIVE = { markedForDeletion: false, archived: false } as const;
const ORDER = [{ sortOrder: "asc" }, { label: "asc" }] as const;

const QUALITY_FALLBACK: AttrOption[] = QUALITY_LEVELS.map((q) => ({
  value: q,
  label: QUALITY_LABELS[q],
}));
const COUNTRY_FALLBACK: AttrOption[] = COUNTRIES.map((c) => ({
  value: c,
  label: COUNTRY_LABELS[c],
}));
const GENDER_FALLBACK: AttrOption[] = GENDER_OPTIONS.map((g) => ({
  value: g,
  label: g,
}));
const SEASON_FALLBACK: AttrOption[] = SEASONS.filter((s) => s !== "").map(
  (s) => ({ value: s, label: SEASON_LABELS[s] ?? s }),
);

export async function loadProductAttributeOptions(): Promise<ProductAttributeOptions> {
  const [quality, countries, genders, seasons] = await Promise.all([
    prisma.mgrQuality.findMany({ where: ACTIVE, orderBy: [...ORDER] }),
    prisma.mgrCountry.findMany({ where: ACTIVE, orderBy: [...ORDER] }),
    prisma.mgrGender.findMany({ where: ACTIVE, orderBy: [...ORDER] }),
    prisma.mgrSeason.findMany({ where: ACTIVE, orderBy: [...ORDER] }),
  ]);

  const map = (rows: { code: string; label: string }[]): AttrOption[] =>
    rows.map((r) => ({ value: r.code, label: r.label }));

  return {
    quality: quality.length ? map(quality) : QUALITY_FALLBACK,
    countries: countries.length ? map(countries) : COUNTRY_FALLBACK,
    genders: genders.length ? map(genders) : GENDER_FALLBACK,
    seasons: seasons.length ? map(seasons) : SEASON_FALLBACK,
  };
}
