import { QUALITY_LABELS, SEASON_LABELS, COUNTRY_LABELS } from "@ltex/shared";
import { BASE_PRICE_TYPE, SALE_PRICE_TYPE } from "./prices";

/**
 * Manager «Прайс» — Stage 2 product card helpers.
 *
 * Pure (DB-agnostic) functions that derive the product card view-model:
 * price classification (продажні / постачальника / інші), characteristics
 * counters, structured key-facts, kg↔шт unit-display conversion. Used by the
 * `/manager/prices/[id]` server page (через `_lib/load-product.ts`).
 *
 * Дані спільні з магазином — читаємо ті самі моделі `Product` / `Lot` /
 * `Price` / `ProductImage` / `Category`. Нічого не дублюємо й не пишемо в БД.
 */

// ─── Класифікація типів цін ─────────────────────────────────────────────────

/**
 * Типи цін, що вважаємо «постачальницькими» (1С: `ЦеныПоставщиков`).
 *
 * У схемі всі ціни лежать в одній таблиці `Price` з вільним текстовим
 * `priceType`. 1С тримає ціни постачальників в окремому регістрі, тож при
 * майбутньому обміні їх priceType, найімовірніше, матиме один із цих кодів.
 * Ми НЕ знаємо напевне, які саме коди прилетять (DB у sandbox недоступна),
 * тому матчимо префіксом — будь-який `supplier*` / `purchase*` / `закуп*` /
 * `постач*` потрапляє у блок «Ціни постачальника». Решта (крім базової й
 * акційної) — у загальний блок «Ціни».
 */
export const SUPPLIER_PRICE_PREFIXES = [
  "supplier",
  "purchase",
  "postач", // транслітерація на випадок латиниці
  "postach",
  "закуп",
  "постач",
] as const;

export function isSupplierPriceType(priceType: string): boolean {
  const t = priceType.trim().toLowerCase();
  return SUPPLIER_PRICE_PREFIXES.some((p) => t.startsWith(p.toLowerCase()));
}

/** Людська назва типу ціни для UI. */
export function priceTypeLabel(priceType: string): string {
  switch (priceType) {
    case BASE_PRICE_TYPE:
      return "Опт (базова)";
    case SALE_PRICE_TYPE:
      return "Акційна";
    default:
      // Решта типів показуємо як є (1С може надсилати власні коди).
      return priceType;
  }
}

export interface RawPrice {
  priceType: string;
  amount: number;
  currency: string;
  validFrom: Date;
}

export interface PriceLine {
  priceType: string;
  label: string;
  amount: number;
  currency: string;
}

export interface ClassifiedPrices {
  /** Усі НЕ-постачальницькі ціни (опт/акція/інші продажні). */
  sale: PriceLine[];
  /** Ціни постачальника. */
  supplier: PriceLine[];
}

function toLine(p: RawPrice): PriceLine {
  return {
    priceType: p.priceType,
    label: priceTypeLabel(p.priceType),
    amount: p.amount,
    currency: p.currency,
  };
}

/**
 * Ділить ціни товару на «продажні» (блок «Ціни») та «постачальника».
 * У кожному блоці лишаємо найновіший запис для кожного `priceType`
 * (за `validFrom`), щоб не показувати застарілі історичні рядки.
 */
export function classifyPrices(prices: RawPrice[]): ClassifiedPrices {
  const latestByType = new Map<string, RawPrice>();
  for (const p of prices) {
    const prev = latestByType.get(p.priceType);
    if (!prev || p.validFrom.getTime() > prev.validFrom.getTime()) {
      latestByType.set(p.priceType, p);
    }
  }

  const sale: PriceLine[] = [];
  const supplier: PriceLine[] = [];
  for (const p of latestByType.values()) {
    if (isSupplierPriceType(p.priceType)) supplier.push(toLine(p));
    else sale.push(toLine(p));
  }

  // Стабільне сортування: базова → акційна → решта (за алфавітом).
  const rank = (t: string): number =>
    t === BASE_PRICE_TYPE ? 0 : t === SALE_PRICE_TYPE ? 1 : 2;
  const byRank = (a: PriceLine, b: PriceLine): number =>
    rank(a.priceType) - rank(b.priceType) ||
    a.priceType.localeCompare(b.priceType);
  sale.sort(byRank);
  supplier.sort((a, b) => a.priceType.localeCompare(b.priceType));

  return { sale, supplier };
}

/** Базова продажна ціна (wholesale) або null. */
export function basePriceOf(prices: RawPrice[]): PriceLine | null {
  const lines = classifyPrices(prices).sale;
  return lines.find((l) => l.priceType === BASE_PRICE_TYPE) ?? null;
}

// ─── Лічильники «Характеристики (N) (M)» + бронь ────────────────────────────

export interface RawLot {
  weight: number;
  status: string;
  videoUrl: string | null;
}

export interface CardLotStats {
  /** N — вільні лоти з залишком (weight > 0). */
  availableCount: number;
  /** M — із них ті, що мають відео. */
  withVideoCount: number;
  /** Кількість зарезервованих лотів. */
  reservedCount: number;
  /** Сумарний залишок (кг) по вільних лотах. */
  remainingKg: number;
}

export function computeLotStats(lots: RawLot[]): CardLotStats {
  let availableCount = 0;
  let withVideoCount = 0;
  let reservedCount = 0;
  let remainingKg = 0;

  for (const lot of lots) {
    if (lot.status === "reserved") reservedCount += 1;
    if (lot.status === "free" && lot.weight > 0) {
      availableCount += 1;
      remainingKg += lot.weight;
      if (lot.videoUrl !== null) withVideoCount += 1;
    }
  }

  return {
    availableCount,
    withVideoCount,
    reservedCount,
    remainingKg: Math.round(remainingKg * 100) / 100,
  };
}

// ─── Структуровані факти (✔), тільки заповнені ──────────────────────────────

export interface RawProductFacts {
  gender: string | null;
  sizes: string | null;
  unitsPerKg: string | null;
  unitWeight: string | null;
  quality: string;
  season: string;
  country: string;
}

export interface KeyFact {
  label: string;
  value: string;
}

/** Лейбли довідникових полів з fallback на сире значення. */
function labelOr(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

/**
 * Будує список фактів ✔ — лише заповнені поля, у фіксованому порядку.
 * Поля quality/country завжди присутні у схемі (non-null), але можуть бути
 * порожніми рядками — порожні відсіюємо.
 */
export function buildKeyFacts(p: RawProductFacts): KeyFact[] {
  const facts: KeyFact[] = [];

  if (p.gender && p.gender.trim()) {
    facts.push({ label: "Стать", value: p.gender.trim() });
  }
  if (p.sizes && p.sizes.trim()) {
    facts.push({ label: "Розміри", value: p.sizes.trim() });
  }
  if (p.quality && p.quality.trim()) {
    facts.push({ label: "Сорт", value: labelOr(QUALITY_LABELS, p.quality) });
  }
  if (p.season && p.season.trim()) {
    facts.push({ label: "Сезон", value: labelOr(SEASON_LABELS, p.season) });
  }
  if (p.country && p.country.trim()) {
    facts.push({ label: "Країна", value: labelOr(COUNTRY_LABELS, p.country) });
  }
  if (p.unitsPerKg && p.unitsPerKg.trim()) {
    facts.push({ label: "Одиниць у кг", value: p.unitsPerKg.trim() });
  }
  if (p.unitWeight && p.unitWeight.trim()) {
    facts.push({ label: "Вага одиниці", value: p.unitWeight.trim() });
  }

  return facts;
}

// ─── Перемикач «Відображати в штуках» ───────────────────────────────────────

/**
 * Форматує залишок у вибраних одиницях. Для товарів `priceUnit="piece"`
 * залишок завжди показуємо у штуках. Для вагових товарів (`kg`) клієнтський
 * toggle дозволяє перерахувати кг у приблизну к-сть штук через `unitsPerKgMin`
 * (одиниць у кг). Якщо коефіцієнта немає — показуємо «—» при увімкненому
 * toggle. Це лише ВІДОБРАЖЕННЯ, в БД нічого не пишемо.
 */
export function formatRemainingDisplay(params: {
  remainingKg: number;
  freeLotsCount: number;
  priceUnit: string;
  unitsPerKg: number | null;
  /** UI-перемикач «Відображати в штуках». */
  showAsPieces: boolean;
}): string {
  const { remainingKg, freeLotsCount, priceUnit, unitsPerKg, showAsPieces } =
    params;

  if (priceUnit === "piece") {
    return `${freeLotsCount} лот.`;
  }

  if (showAsPieces) {
    if (unitsPerKg && unitsPerKg > 0) {
      const pcs = Math.round(remainingKg * unitsPerKg);
      return `≈ ${pcs.toLocaleString("uk-UA")} шт`;
    }
    return "—";
  }

  return `${remainingKg.toLocaleString("uk-UA")} кг`;
}
