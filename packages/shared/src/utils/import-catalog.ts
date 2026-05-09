/**
 * Pure helpers for `Повний каталог товарів.xlsx` → DB import.
 * No side-effects (no FS, no Prisma). All consumers in `scripts/import-catalog-from-excel.ts`.
 */

import { generateSlug } from "./slug";

// ─── Token classification ────────────────────────────────────────────────────

export type ClassifiedTokenKind =
  | "category"
  | "quality"
  | "season"
  | "country"
  | "gender"
  | "noise";

export interface ClassifiedToken {
  kind: ClassifiedTokenKind;
  value: string;
  raw: string;
}

const SIZE_NOISE = new Set([
  "xxl",
  "xxxl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "xs",
  "s",
  "m",
  "l",
  "xl",
]);

/**
 * Lowercases, replaces straight/curly apostrophes with ASCII ', strips trailing
 * dots and the lone " D" supplier marker. Used before regex-matching tokens.
 */
function normalize(token: string): string {
  return token
    .toLowerCase()
    .replace(/[`’ʼ']/g, "'")
    .trim()
    .replace(/\s+/g, " ");
}

export function classifyToken(raw: string): ClassifiedToken {
  const t = normalize(raw);
  if (!t) return { kind: "noise", value: "", raw };

  // ── quality (incl. combined grades)
  if (/^екстра$/.test(t)) return { kind: "quality", value: "extra", raw };
  if (/^крем$/.test(t)) return { kind: "quality", value: "cream", raw };
  if (/^1[-]?[йьі]?\s*сорт$/.test(t))
    return { kind: "quality", value: "first", raw };
  if (/^2[-]?[йьі]?\s*сорт$/.test(t))
    return { kind: "quality", value: "second", raw };
  if (/^сток$/.test(t)) return { kind: "quality", value: "stock", raw };
  if (/^мікс$/.test(t)) return { kind: "quality", value: "mix", raw };
  if (/^екстра\s*\+\s*1[-]?[йьі]?\s*сорт$/.test(t))
    return { kind: "quality", value: "extra_first", raw };
  if (/^екстра\s*\+\s*крем$/.test(t))
    return { kind: "quality", value: "extra_cream", raw };
  if (/^1[-]?[йьі]?\s*\+\s*2[-]?[йьі]?\s*сорт$/.test(t))
    return { kind: "quality", value: "first_second", raw };
  // "Сток + крем" appears once — bucket into extra_cream proxy (closest combined)
  if (/^сток\s*\+\s*крем$/.test(t))
    return { kind: "quality", value: "extra_cream", raw };

  // ── season
  if (/^зима$/.test(t)) return { kind: "season", value: "winter", raw };
  if (/^літо$/.test(t)) return { kind: "season", value: "summer", raw };
  if (/^демісезон$/.test(t))
    return { kind: "season", value: "demiseason", raw };
  if (/^всесезонне?$/.test(t))
    return { kind: "season", value: "all_season", raw };

  // ── country
  if (/^англія$/.test(t)) return { kind: "country", value: "england", raw };
  if (/^німеччина(\s+d)?$/.test(t))
    return { kind: "country", value: "germany", raw };
  if (/^канада$/.test(t)) return { kind: "country", value: "canada", raw };
  if (/^польща$/.test(t)) return { kind: "country", value: "poland", raw };
  if (/^шотландія$/.test(t)) return { kind: "country", value: "scotland", raw };
  if (/^(сша|америка)$/.test(t)) return { kind: "country", value: "usa", raw };
  // Other European countries fold into germany (largest pool, conservative default)
  // until COUNTRIES enum is widened. Logged in report under unrecognized tokens.
  if (
    /^(бельгія|франція|італія|голандія|голландія|нідерланди|австрія|данія|швеція)$/.test(
      t,
    )
  )
    return { kind: "country", value: "germany", raw };

  // ── gender
  if (/^жіноче$/.test(t)) return { kind: "gender", value: "Жіноча", raw };
  if (/^чоловіче$/.test(t)) return { kind: "gender", value: "Чоловіча", raw };
  if (/^дитяче$/.test(t)) return { kind: "gender", value: "Дитяча", raw };
  if (/^(мікс\s+жіноче\s*\+\s*чоловіче|унісекс)$/.test(t))
    return { kind: "gender", value: "Унісекс", raw };
  if (/^(мікс\s+доросле\s*\+\s*дитяче|доросле)$/.test(t))
    return { kind: "gender", value: "Дорослий", raw };

  // ── noise (size markers leak into category cell sometimes)
  if (SIZE_NOISE.has(t)) return { kind: "noise", value: "size", raw };

  return { kind: "category", value: t, raw };
}

// ─── Excel cell parsers ──────────────────────────────────────────────────────

export interface NomenklaturaParts {
  name: string;
  videoUrl: string | null;
  weightFromName: number | null;
}

/**
 * Splits "Назва, https://youtu.be/abc, 25" into { name, videoUrl, weightFromName }.
 * - Ignores comma-noise inside the name (joins parts before the URL with ", ").
 * - Weight may be a range like "15-20" → returns the lower bound (15).
 */
export function parseNomenklatura(cell: unknown): NomenklaturaParts {
  if (cell == null) return { name: "", videoUrl: null, weightFromName: null };
  const text = String(cell).trim();
  if (!text) return { name: "", videoUrl: null, weightFromName: null };

  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const urlIdx = parts.findIndex((p) => /youtu\.?be|youtube\.com/i.test(p));
  if (urlIdx < 0) {
    return { name: text, videoUrl: null, weightFromName: null };
  }

  const name = parts.slice(0, urlIdx).join(", ").trim();
  const videoUrl = parts[urlIdx] ?? null;
  const tail = parts[urlIdx + 1];
  const weightFromName = parseWeight(tail);

  return { name: name || text, videoUrl, weightFromName };
}

function parseWeight(s: string | undefined): number | null {
  if (!s) return null;
  // "25", "15-20", "0,25-0,45 кг" → take first number, support comma decimals
  const match = String(s)
    .replace(",", ".")
    .match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses human-readable range strings into numeric { min, max }.
 * Accepts ranges ("2-4", "0,25-0,45 кг") or single values ("10", "1.5"),
 * supports both `.` and `,` as decimal separators, ignores trailing units.
 * Returns null when no number could be extracted. Auto-swaps reversed ranges.
 */
export function parseRangeString(
  s: string | null | undefined,
): { min: number; max: number } | null {
  if (s == null) return null;
  const text = String(s).trim();
  if (!text) return null;
  const normalized = text.replace(/,/g, ".");

  const rangeMatch = normalized.match(
    /(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/,
  );
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
  }

  const singleMatch = normalized.match(/-?\d+(?:\.\d+)?/);
  if (singleMatch) {
    const n = Number(singleMatch[0]);
    if (Number.isFinite(n)) return { min: n, max: n };
  }
  return null;
}

export interface DescriptionFields {
  quality: string | null;
  season: string | null;
  country: string | null;
  gender: string | null;
  sizes: string | null;
  unitsPerKg: string | null;
  unitWeight: string | null;
  weightLot: number | null;
}

/**
 * Parses checklist-style descriptions (`✔Сорт: 1й\n✔Стать: Жіноча...`).
 * Both `✔` (U+2714) and `✔️` (with U+FE0F variation selector) are accepted.
 * Empty values (stub descriptions) yield null.
 */
export function parseDescription(cell: unknown): DescriptionFields {
  const out: DescriptionFields = {
    quality: null,
    season: null,
    country: null,
    gender: null,
    sizes: null,
    unitsPerKg: null,
    unitWeight: null,
    weightLot: null,
  };
  if (cell == null) return out;
  const text = String(cell);
  if (!text.trim()) return out;

  const map: Record<string, string> = {};
  // Match "✔key: value" until the next ✔ or end-of-string
  const re = /✔️?\s*([^:]+?)\s*:\s*([\s\S]*?)(?=✔️?|$)/g;
  for (const m of text.matchAll(re)) {
    const key = (m[1] ?? "").trim().toLowerCase();
    const value = (m[2] ?? "")
      .trim()
      .replace(/[\r\n]+$/g, "")
      .trim();
    if (key) map[key] = value;
  }

  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = map[k];
      if (v && v.length > 0) return v;
    }
    return null;
  };

  // Сорт → quality (description values are short: "1й", "Сток", "Екстра+Крем")
  const sortRaw = pick("сорт");
  if (sortRaw) {
    const norm = normalize(sortRaw);
    if (/^1[-]?[йьі]?$/.test(norm)) out.quality = "first";
    else if (/^2[-]?[йьі]?$/.test(norm)) out.quality = "second";
    else if (/^екстра$/.test(norm)) out.quality = "extra";
    else if (/^крем$/.test(norm)) out.quality = "cream";
    else if (/^сток$/.test(norm)) out.quality = "stock";
    else if (/^мікс$/.test(norm)) out.quality = "mix";
    else if (/^екстра\s*\+\s*1[-]?[йьі]?$/.test(norm))
      out.quality = "extra_first";
    else if (/^екстра\s*\+\s*крем$/.test(norm)) out.quality = "extra_cream";
    else if (/^1[-]?[йьі]?\s*\+\s*2[-]?[йьі]?$/.test(norm))
      out.quality = "first_second";
    else {
      // Fall back to classifyToken (handles "1-й сорт" style)
      const cls = classifyToken(sortRaw);
      if (cls.kind === "quality") out.quality = cls.value;
    }
  }

  // Сезон → season
  const seasonRaw = pick("сезон");
  if (seasonRaw) {
    const cls = classifyToken(seasonRaw);
    if (cls.kind === "season") out.season = cls.value;
  }

  // Країна → country
  const countryRaw = pick("країна");
  if (countryRaw) {
    const cls = classifyToken(countryRaw);
    if (cls.kind === "country") out.country = cls.value;
  }

  // Стать → gender (preserve raw label, normalize "Жіноча/Чоловіча" → Унісекс)
  const genderRaw = pick("стать");
  if (genderRaw) {
    const norm = genderRaw.replace(/\.$/, "").trim();
    if (/жіноча\s*\/\s*чоловіча|чоловіча\s*\/\s*жіноча/i.test(norm))
      out.gender = "Унісекс";
    else if (/доросла\s*\/\s*дитяча|дитяча\s*\/\s*доросла/i.test(norm))
      out.gender = "Дорослий";
    else if (/^жіноча$/i.test(norm)) out.gender = "Жіноча";
    else if (/^чоловіча$/i.test(norm)) out.gender = "Чоловіча";
    else if (/^дитяча$/i.test(norm)) out.gender = "Дитяча";
    else if (/^унісекс$/i.test(norm)) out.gender = "Унісекс";
    else out.gender = norm;
  }

  out.sizes = pick("розміри", "розмір") ?? null;
  out.unitsPerKg = pick("кількість одиниць", "к-сть од.", "к-сть од") ?? null;
  out.unitWeight = pick("вага одиниці") ?? null;

  const lot = pick("вага лота", "вага лотів");
  if (lot) out.weightLot = parseWeight(lot);

  return out;
}

export function parseCategoryCell(cell: unknown): ClassifiedToken[] {
  if (cell == null) return [];
  const text = String(cell);
  if (!text.trim()) return [];
  return text
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map(classifyToken);
}

// ─── Mappings: Excel category-string → DB subcategory slug ───────────────────

export const CATEGORY_SLUG_MAP: Record<string, string> = {
  // Top-level umbrellas (alone) → catch-alls
  одяг: "miks-odyag",
  "одяг мікс": "miks-odyag",
  взуття: "inshe-vzuttia",
  "взуття мікс": "inshe-vzuttia",
  аксесуари: "inshe-aksesuary",
  "дім та побут": "inshe-dim",
  іграшки: "miaki",
  "bric-a-brac": "miks-bric",
  "bric a brac": "miks-bric",
  косметика: "miks-kosmetyka",

  // Одяг — clothing subcategories
  футболки: "futbolky",
  сорочки: "sorochky",
  "сорочки та блузи": "sorochky",
  блузи: "bluzy",
  світшоти: "svitshoty",
  "худі та світшоти": "svitshoty",
  светри: "svetry",
  "светри та кардигани": "svetry",
  "кофти флісові": "kofty-flisovi",
  куртки: "kurtky",
  "куртки та пальта": "kurtky",
  жилети: "zhylety",
  жилетки: "zhylety",
  джинси: "dzhinsy",
  штани: "shtany",
  "штани та брюки": "shtany",
  шорти: "shorty",
  "спортивні штани": "sportyvni-shtany",
  сукні: "sukni-spidnytsi",
  спідниці: "sukni-spidnytsi",
  "сукні та спідниці": "sukni-spidnytsi",
  "спідниці та плаття": "sukni-spidnytsi",
  піжами: "pizhamy",
  "халати та піжами": "pizhamy",
  білизна: "bilyzna",
  "нижня білизна": "bilyzna",
  купальники: "kupalniky",
  "робочий одяг": "robochyy-odyag",
  "військовий одяг": "spets-odyah",
  "спец-одяг": "spets-odyah",
  "спец одяг": "spets-odyah",
  "вітровки та штормовки": "vitrovky-shtormovky",
  "лижний одяг": "lyzhnyy-odyag",
  лосини: "losyny",
  "колготки та легінси": "kolhotky",
  колготки: "kolhotky",
  легінси: "kolhotky",
  шкарпетки: "shkarpetky",
  "спортивний одяг": "sportyvnyy-odyag",

  // Взуття
  кросівки: "krosivky",
  "кросівки та кеди": "krosivky",
  кеди: "krosivky",
  черевики: "cherevyky",
  "черевики та чоботи": "cherevyky",
  чоботи: "choboty",
  туфлі: "tufli",
  "туфлі та босоніжки": "tufli",
  босоніжки: "tufli",
  сандалі: "sandali",
  шльопанці: "shlopantsi",
  "тапочки та шльопанці": "shlopantsi",
  тапочки: "shlopantsi",
  "гумове взуття": "humove-vzuttia",
  "робоче взуття": "roboche-vzuttia",
  "спортивне взуття": "sportyvne-vzuttia",

  // Аксесуари
  сумки: "sumky",
  "сумки та рюкзаки": "sumky",
  рюкзаки: "sumky",
  ремені: "remeni",
  "шапки та головні убори": "holovni-ubory",
  "головні убори": "holovni-ubory",
  шапки: "holovni-ubory",
  рукавиці: "rukavytsi",
  рукавички: "rukavytsi",
  "рукавиці / рукавички": "rukavytsi",
  біжутерія: "inshe-aksesuary",

  // Дім та побут
  постіль: "postil",
  штори: "shtory",
  рушники: "rushnyky",
  ковдри: "kovdry",
  "домашній текстиль": "inshe-dim",
  "побутові товари": "inshe-dim",
  "килими та килимки": "inshe-dim",
  "товари для тварин": "inshe-dim",
  "спальні мішки": "inshe-dim",
  пряжа: "pryazha",
  agd: "agd",

  // Іграшки
  "м'які іграшки": "miaki",
  "пластикові іграшки": "plastykovi",
  "іграшка м'яка": "miaki",
  "іграшка тверда": "plastykovi",
};

/** SKU → explicit category override (Sheet-3 special-cases). */
export const SKU_CATEGORY_OVERRIDE: Record<
  string,
  { slug: string | null; gender?: string }
> = {
  "87533": { slug: "sportyvne-vzuttia" },
  "COOLER-BAG-LG": { slug: "sumky" },
  "COOLER-BAG-MED": { slug: "sumky" },
  "COOLER-TUB": { slug: "sumky" },
  "FBL - 3": { slug: "sportyvne-vzuttia" },
  "FBL -1": { slug: "sportyvne-vzuttia" },
  "L.MIX Bodysuits": { slug: "bilyzna", gender: "Дитяча" },
  "L.MIX Crivit Football #5": { slug: null },
  "Office pens Mix": { slug: "miks-bric" },
  "Overshirt Parkside": { slug: "robochyy-odyag" },
  "SPT-1 F": { slug: "sportyvnyy-odyag" },
};

/** Deprecated category slugs in DB → migration target subcategory slug. */
export const CATEGORY_MIGRATIONS: Record<string, string> = {
  tolstovky: "svitshoty",
  palto: "kurtky",
  "verhniiy-odyag": "kurtky",
  "dytiachyi-odyag": "inshe-odyag",
  kostyumy: "inshe-odyag",
  kombinezony: "inshe-odyag",
  sukni: "sukni-spidnytsi",
  spidnytsi: "sukni-spidnytsi",
};

/** Deprecated DB slugs that should be deleted after products migrated. */
export const DEPRECATED_CATEGORY_SLUGS: string[] =
  Object.keys(CATEGORY_MIGRATIONS);

/** Slug → "shoes-like"? Used to switch priceUnit default to "piece". */
export function isFootwear(categorySlug: string): boolean {
  return [
    "krosivky",
    "cherevyky",
    "choboty",
    "tufli",
    "sandali",
    "shlopantsi",
    "humove-vzuttia",
    "roboche-vzuttia",
    "sportyvne-vzuttia",
    "inshe-vzuttia",
  ].includes(categorySlug);
}

// ─── Slug helper (re-export for tests + script ergonomics) ───────────────────

export { generateSlug as slugify };
