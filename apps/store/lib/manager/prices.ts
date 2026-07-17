import { Prisma } from "@ltex/db";

/**
 * Manager «Прайс» — Stage 1 list helpers.
 *
 * Pure (DB-agnostic) functions that build the Prisma `where` clause and derive
 * per-product display values (залишок, базова/акційна ціна, прапори).
 * Shared by the `GET /api/v1/manager/prices` endpoint and the `/manager/prices`
 * server page. Дані спільні з магазином — читаємо ті самі моделі
 * `Product` / `Lot` / `Price`, нічого не дублюємо.
 */

/** Базова продажна ціна (як у магазині/`/lots`). */
export const BASE_PRICE_TYPE = "wholesale";
/** Акційна ціна. */
export const SALE_PRICE_TYPE = "akciya";

/** «Нові» товари — створені за останні N днів. */
export const NEW_PRODUCT_WINDOW_DAYS = 14;

export type PriceSort = "name" | "arrival";
export type SortDir = "asc" | "desc";

export interface BuildPricesWhereParams {
  /** Пошук по `name` + `articleCode` (insensitive). */
  q?: string;
  /**
   * Обрана категорія. Якщо передано `categorySubtreeIds` — фільтр по всьому
   * піддереву; інакше — точна відповідність `categoryId`.
   */
  categoryId?: string;
  /**
   * Піддерево обраної категорії (категорія + усі нащадки). Має пріоритет над
   * `categoryId`. Обчислюється у завантажувачі через `collectCategorySubtreeIds`.
   */
  categorySubtreeIds?: string[];
  /**
   * Каркас доступів за групами (5.7): id категорій, прихованих для ролі
   * переглядача (deny-list зі спадковістю). Товари у цих категоріях не
   * показуються. admin/owner → не передавати (bypass). Зараз скрізь порожній.
   */
  hiddenCategoryIds?: string[];
  /** Період приходу (по `Lot.arrivalDate` ?? `Lot.createdAt`). */
  arrivalFrom?: Date;
  arrivalTo?: Date;
  /** Діапазон базової ціни (EUR, по `priceType = wholesale`). */
  priceFrom?: number;
  priceTo?: number;
  /** Є лот зі залишком (`status = free`) АБО `Product.inStock`. */
  inStock?: boolean;
  /** Є лот з прапором `isTarget`. */
  target?: boolean;
  /** Акційна ціна нижча за базову. */
  onSale?: boolean;
  /** `Product.createdAt` за останні 14 днів. */
  isNew?: boolean;
  /** Наявність відео в товара/лота. */
  hasVideo?: boolean;
  /** Відсутність відео в товара/лота. */
  noVideo?: boolean;
  /** Базова дата (для тесту «нових»); за замовчуванням — `new Date()`. */
  now?: Date;
}

/** Дата відсічки для прапора «нові товари». */
export function newProductCutoff(now: Date = new Date()): Date {
  return new Date(
    now.getTime() - NEW_PRODUCT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
}

/**
 * Будує `where` для `prisma.product.findMany`. Чиста функція — без I/O.
 */
export function buildPricesWhere(
  p: BuildPricesWhereParams,
): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  if (p.q && p.q.trim().length > 0) {
    const q = p.q.trim();
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { articleCode: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  // Категорія: піддерево (категорія + нащадки) має пріоритет; інакше точний id.
  if (p.categorySubtreeIds && p.categorySubtreeIds.length > 0) {
    and.push({ categoryId: { in: p.categorySubtreeIds } });
  } else if (p.categoryId) {
    and.push({ categoryId: p.categoryId });
  }

  // Каркас доступів (5.7): виключаємо товари з прихованих для ролі категорій.
  if (p.hiddenCategoryIds && p.hiddenCategoryIds.length > 0) {
    and.push({ categoryId: { notIn: p.hiddenCategoryIds } });
  }

  // Період приходу: лот, у якого (arrivalDate ?? createdAt) у діапазоні.
  // Prisma не вміє coalesce у where, тому OR двох гілок:
  //  • arrivalDate != null і в діапазоні;
  //  • arrivalDate == null і createdAt у діапазоні.
  if (p.arrivalFrom || p.arrivalTo) {
    const range: Prisma.DateTimeFilter = {};
    if (p.arrivalFrom) range.gte = p.arrivalFrom;
    if (p.arrivalTo) range.lte = p.arrivalTo;
    and.push({
      lots: {
        some: {
          OR: [
            { arrivalDate: range },
            { AND: [{ arrivalDate: null }, { createdAt: range }] },
          ],
        },
      },
    });
  }

  // Діапазон базової ціни — по записах Price з priceType = wholesale.
  if (p.priceFrom !== undefined || p.priceTo !== undefined) {
    const amount: Prisma.FloatFilter = {};
    if (p.priceFrom !== undefined) amount.gte = p.priceFrom;
    if (p.priceTo !== undefined) amount.lte = p.priceTo;
    and.push({
      prices: { some: { priceType: BASE_PRICE_TYPE, amount } },
    });
  }

  if (p.inStock) {
    and.push({
      OR: [{ inStock: true }, { lots: { some: { status: "free" } } }],
    });
  }

  if (p.target) {
    and.push({ lots: { some: { isTarget: true } } });
  }

  // Акційна: існує запис akciya, нижчий за будь-який wholesale товара.
  // Точне попарне порівняння у SQL дороге; у списку фільтруємо на наявність
  // обох типів і додатково відсіюємо у деривації (див. deriveProductRow).
  if (p.onSale) {
    and.push({
      AND: [
        { prices: { some: { priceType: SALE_PRICE_TYPE } } },
        { prices: { some: { priceType: BASE_PRICE_TYPE } } },
      ],
    });
  }

  if (p.isNew) {
    and.push({ createdAt: { gte: newProductCutoff(p.now) } });
  }

  if (p.hasVideo) {
    and.push({
      OR: [
        { videoUrl: { not: null } },
        { lots: { some: { videoUrl: { not: null } } } },
      ],
    });
  }

  if (p.noVideo) {
    and.push({ videoUrl: null });
    and.push({ NOT: { lots: { some: { videoUrl: { not: null } } } } });
  }

  return and.length > 0 ? { AND: and } : {};
}

/** orderBy для findMany. `arrival` сортує по createdAt товара (proxy приходу). */
export function buildPricesOrderBy(
  sort: PriceSort,
  dir: SortDir,
): Prisma.ProductOrderByWithRelationInput {
  if (sort === "arrival") return { createdAt: dir };
  return { name: dir };
}

// ─── Деривація рядка списку ─────────────────────────────────────────────────

export interface RawPriceProduct {
  id: string;
  articleCode: string | null;
  name: string;
  slug: string;
  description: string;
  priceUnit: string;
  videoUrl: string | null;
  inStock: boolean;
  createdAt: Date;
  category: { name: string } | null;
  prices: { priceType: string; amount: number; currency: string }[];
  lots: {
    weight: number;
    quantity: number;
    status: string;
    isTarget: boolean;
    videoUrl: string | null;
  }[];
}

export interface PriceRow {
  id: string;
  articleCode: string | null;
  name: string;
  slug: string;
  /** Опис-прев'ю (більше не показується у списку — лишено для share-тексту). */
  description: string;
  /** Посилання на YouTube-огляд товара (для контекстного меню). */
  videoUrl: string | null;
  categoryName: string | null;
  /** Сумарний залишок у кг (вільні лоти). */
  remainingKg: number;
  /** Сумарна кількість одиниць у вільних лотах (шт/пар). */
  remainingUnits: number;
  /** Кількість вільних лотів. */
  freeLotsCount: number;
  /** Одиниця виміру (kg | piece). */
  priceUnit: string;
  /** Базова ціна (wholesale) або null. */
  basePrice: number | null;
  /** Акційна ціна (akciya, якщо < базової) або null. */
  salePrice: number | null;
  currency: string;
  isTarget: boolean;
  isNew: boolean;
  hasVideo: boolean;
  /** Активні замовлення на товар (Етап 1 блоку Замовлень). null коли немає або
   *  не запрошувалось (опційне — backward-compat). */
  claim: {
    totalQuantity: number;
    totalWeight: number;
    ordersCount: number;
  } | null;
}

/**
 * Перетворює raw-товар (з findMany include) у плаский рядок списку.
 * Чиста функція — без I/O.
 */
export function deriveProductRow(
  p: RawPriceProduct,
  now: Date = new Date(),
): PriceRow {
  const freeLots = p.lots.filter((l) => l.status === "free");
  const remainingKg = freeLots.reduce((sum, l) => sum + (l.weight || 0), 0);
  const remainingUnits = freeLots.reduce(
    (sum, l) => sum + (l.quantity || 0),
    0,
  );

  const base = p.prices.find((pr) => pr.priceType === BASE_PRICE_TYPE);
  const sale = p.prices.find((pr) => pr.priceType === SALE_PRICE_TYPE);
  const basePrice = base ? base.amount : null;
  const salePrice =
    sale && (basePrice === null || sale.amount < basePrice)
      ? sale.amount
      : null;

  const hasVideo =
    p.videoUrl !== null || p.lots.some((l) => l.videoUrl !== null);
  const isTarget = p.lots.some((l) => l.isTarget);
  const isNew = p.createdAt.getTime() >= newProductCutoff(now).getTime();

  return {
    id: p.id,
    articleCode: p.articleCode,
    name: p.name,
    slug: p.slug,
    description: p.description,
    videoUrl: p.videoUrl,
    categoryName: p.category?.name ?? null,
    remainingKg: Math.round(remainingKg * 100) / 100,
    remainingUnits,
    freeLotsCount: freeLots.length,
    priceUnit: p.priceUnit,
    basePrice,
    salePrice,
    currency: base?.currency ?? sale?.currency ?? "EUR",
    isTarget,
    isNew,
    hasVideo,
    claim: null,
  };
}

/** Prisma `include`/`select` для рядка прайсу — узгоджено з RawPriceProduct. */
export const priceRowInclude = {
  category: { select: { name: true } },
  prices: {
    where: { priceType: { in: [BASE_PRICE_TYPE, SALE_PRICE_TYPE] } },
    select: { priceType: true, amount: true, currency: true },
  },
  lots: {
    select: {
      weight: true,
      quantity: true,
      status: true,
      isTarget: true,
      videoUrl: true,
    },
  },
} satisfies Prisma.ProductInclude;
