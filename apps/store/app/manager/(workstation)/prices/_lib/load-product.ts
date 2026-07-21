import { prisma } from "@ltex/db";
import {
  basePriceOf,
  buildKeyFacts,
  classifyPrices,
  computeLotStats,
  type CardLotStats,
  type ClassifiedPrices,
  type KeyFact,
  type PriceLine,
  type RawPrice,
} from "@/lib/manager/product-card";
import {
  BASE_PRICE_TYPE,
  SALE_PRICE_TYPE,
  newProductCutoff,
} from "@/lib/manager/prices";
import { isInStockStatus } from "@/lib/manager/lots-list";
import {
  getProductClaims,
  type ProductClaims,
} from "@/lib/manager/product-claims";

/**
 * Server loader для картки товару (`/manager/prices/[id]`).
 *
 * Читає товар із спільних із магазином моделей `Product` / `Lot` / `Price` /
 * `ProductImage` / `Category` — нічого не дублюємо й не пишемо в БД. Чиста
 * деривація (ціни / лічильники / факти) — у `lib/manager/product-card.ts`,
 * тут лише I/O + збірка view-model.
 */

export interface ProductImageVM {
  url: string;
  alt: string;
}

export interface ProductLotVM {
  id: string;
  barcode: string;
  weight: number;
  quantity: number;
  status: string;
  priceEur: number;
  hasVideo: boolean;
  isTarget: boolean;
  /** arrivalDate ?? createdAt (ISO) — для read-only таблиці. */
  arrivalIso: string;
  /** Менеджерські поля (Етап 3a) — для розширеної таблиці й картки лоту. */
  sector: string | null;
  isOpen: boolean;
  /** Дата відеоогляду лоту (ISO) або null. */
  videoDateIso: string | null;
  /** true коли status === "reserved". */
  isReserved: boolean;
  // ── Бронь (Етап 4) — для дисплею в таблиці лотів картки товару ──
  /** Ім'я клієнта, на якого заброньовано (для показу). */
  reservedForName: string | null;
  /** Дата «до якої діє бронь» (ISO) або null. */
  reservedUntilIso: string | null;
  /** Активна бронь (reservedUntil ще не минув). */
  isActiveReservation: boolean;
  /** Активна бронь належить поточному менеджеру. */
  isMineReservation: boolean;
}

export interface ProductCardVM {
  id: string;
  articleCode: string | null;
  name: string;
  slug: string;
  description: string;
  categoryName: string | null;
  /** Id категорії товару (для каркаса доступів). */
  categoryId: string | null;
  /** Повний шлях категорії (корінь→…→категорія), напр. ["Одяг", "Жіночий", "Сукні"]. */
  categoryPath: string[];
  videoUrl: string | null;
  priceUnit: string;
  /** Середня вага мішка (кг) — характеристика для розрахунку у замовленні. */
  averageWeight: number | null;
  /** Коефіцієнт «одиниць у кг» для toggle «у штуках» (Float, може бути null). */
  unitsPerKg: number | null;
  images: ProductImageVM[];
  /** Базова продажна ціна (wholesale) або null. */
  basePrice: PriceLine | null;
  /** Акційна ціна €/кг (akciya, якщо < базової) — для share-тексту/бейджа. */
  salePrice: number | null;
  /** Товар створено за останні 14 днів («новинка») — для share-тексту/бейджа. */
  isNew: boolean;
  /** Класифіковані ціни: продажні + постачальника. */
  prices: ClassifiedPrices;
  /** ✔ структуровані факти, тільки заповнені. */
  keyFacts: KeyFact[];
  /** Лічильники характеристик + бронь + залишок. */
  lotStats: CardLotStats;
  /** Усі лоти товару — для розширеної таблиці + картки лоту. */
  lots: ProductLotVM[];
  /** Загальна кількість лотів товару (для заголовка «Лоти (N)»). */
  totalLotsCount: number;
  /** Активні замовлення на товар (← Етап 1 блоку Замовлень). null коли viewer
   *  не передано (анонімний рендер). */
  claims: ProductClaims | null;
  /** Ціни постачальників (історія закупівель з Поступлень, новіші зверху) —
   *  показуються лише власнику/адміну. */
  supplierPrices: SupplierPriceVM[];
  /** Сирі поля для редактора «Характеристики» (значення as-is у Product). */
  edit: ProductEditFields;
}

export interface SupplierPriceVM {
  supplierName: string;
  priceEur: number;
  dateIso: string;
  /** 'receiving' (з документа поступлення) | 'manual' (ручний запис). */
  source: string;
}

export interface ProductEditFields {
  season: string;
  quality: string;
  gender: string;
  country: string;
  sizes: string;
  unitsPerKg: string;
  unitWeight: string;
  filling: string;
  producer: string;
  receiptName: string;
  packaging: string;
  videoUrl: string;
}

export async function loadProductCard(
  id: string,
  viewerUserId?: string,
): Promise<ProductCardVM | null> {
  const now = new Date();
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      articleCode: true,
      name: true,
      slug: true,
      description: true,
      videoUrl: true,
      createdAt: true,
      priceUnit: true,
      unitsPerKgMin: true,
      averageWeight: true,
      gender: true,
      sizes: true,
      unitsPerKg: true,
      unitWeight: true,
      filling: true,
      producer: true,
      receiptName: true,
      packaging: true,
      quality: true,
      season: true,
      country: true,
      categoryId: true,
      // Шлях категорії (до 5 рівнів вгору — 1С-дерева неглибокі).
      category: {
        select: {
          name: true,
          parent: {
            select: {
              name: true,
              parent: {
                select: {
                  name: true,
                  parent: {
                    select: {
                      name: true,
                      parent: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      images: {
        orderBy: { position: "asc" },
        select: { url: true, alt: true },
      },
      prices: {
        select: {
          priceType: true,
          amount: true,
          currency: true,
          validFrom: true,
        },
      },
      lots: {
        orderBy: [{ arrivalDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          barcode: true,
          weight: true,
          quantity: true,
          status: true,
          priceEur: true,
          videoUrl: true,
          isTarget: true,
          arrivalDate: true,
          createdAt: true,
          sector: true,
          isOpen: true,
          videoDate: true,
          reservedForName: true,
          reservedByUserId: true,
          reservedUntil: true,
        },
      },
    },
  });

  if (!product) return null;

  // Активні замовлення на цей товар (Етап 1 блоку Замовлень). Тягнемо тут, щоб
  // картка товару одразу мала повний контекст (хто і на скільки претендує).
  // Анонімний рендер (viewerUserId не передано) → null (відключаємо панель).
  const claims = viewerUserId ? await getProductClaims(id, viewerUserId) : null;

  // Ціни постачальників — історія закупівель (PurchasePrice) з Поступлень.
  // Реєструються автоматично при проведенні поступлення; показуємо історію.
  const purchaseRows = await prisma.purchasePrice.findMany({
    where: { productId: id },
    orderBy: { validFrom: "desc" },
    take: 50,
    select: {
      priceEur: true,
      validFrom: true,
      source: true,
      supplier: { select: { name: true } },
    },
  });
  const supplierPrices: SupplierPriceVM[] = purchaseRows.map((r) => ({
    supplierName: r.supplier?.name ?? "—",
    priceEur: r.priceEur,
    dateIso: r.validFrom.toISOString(),
    source: r.source,
  }));

  const rawPrices: RawPrice[] = product.prices.map((p) => ({
    priceType: p.priceType,
    amount: p.amount,
    currency: p.currency,
    validFrom: p.validFrom,
  }));

  // Базова/акційна ціна €/кг — для share-тексту й бейджа «АКЦІЯ».
  const baseLine = basePriceOf(rawPrices);
  const saleRaw = rawPrices.find((p) => p.priceType === SALE_PRICE_TYPE);
  const baseRaw = rawPrices.find((p) => p.priceType === BASE_PRICE_TYPE);
  const salePrice =
    saleRaw && (!baseRaw || saleRaw.amount < baseRaw.amount)
      ? saleRaw.amount
      : null;
  const isNew = product.createdAt.getTime() >= newProductCutoff(now).getTime();

  const lotStats = computeLotStats(
    product.lots.map((l) => ({
      weight: l.weight,
      status: l.status,
      videoUrl: l.videoUrl,
    })),
  );

  // Показуємо ЛИШЕ наявні на складі лоти (вільні + заброньовані, із залишком).
  // Архівні/продані/розібрані/у-дорозі мішки прибрано з таблиці картки товару
  // (рішення user 2026-07-11) — вони не мають фігурувати у списку наявності.
  const lots: ProductLotVM[] = product.lots
    .filter((l) => l.weight > 0 && isInStockStatus(l.status))
    .map((l) => {
      const isActive =
        l.reservedUntil !== null && l.reservedUntil.getTime() >= now.getTime();
      return {
        id: l.id,
        barcode: l.barcode,
        weight: l.weight,
        quantity: l.quantity,
        status: l.status,
        priceEur: l.priceEur,
        hasVideo: l.videoUrl !== null,
        isTarget: l.isTarget,
        arrivalIso: (l.arrivalDate ?? l.createdAt).toISOString(),
        sector: l.sector,
        isOpen: l.isOpen,
        videoDateIso: l.videoDate ? l.videoDate.toISOString() : null,
        isReserved: l.status === "reserved",
        reservedForName: l.reservedForName,
        reservedUntilIso: l.reservedUntil
          ? l.reservedUntil.toISOString()
          : null,
        isActiveReservation: isActive,
        isMineReservation:
          isActive &&
          viewerUserId !== undefined &&
          l.reservedByUserId === viewerUserId,
      };
    });

  // Повний шлях категорії: розгортаємо ланцюг parent → корінь, тоді reverse.
  const categoryPath = buildCategoryPath(product.category);

  return {
    id: product.id,
    articleCode: product.articleCode,
    name: product.name,
    slug: product.slug,
    description: product.description,
    categoryName: product.category?.name ?? null,
    categoryId: product.categoryId,
    categoryPath,
    videoUrl: product.videoUrl,
    priceUnit: product.priceUnit,
    averageWeight: product.averageWeight,
    unitsPerKg: product.unitsPerKgMin,
    images: product.images.map((img) => ({ url: img.url, alt: img.alt })),
    basePrice: baseLine,
    salePrice,
    isNew,
    prices: classifyPrices(rawPrices),
    keyFacts: buildKeyFacts({
      gender: product.gender,
      sizes: product.sizes,
      unitsPerKg: product.unitsPerKg,
      unitWeight: product.unitWeight,
      quality: product.quality,
      season: product.season,
      country: product.country,
    }),
    lotStats,
    lots,
    // Кількість наявних лотів (після фільтра) — для заголовка «Лоти в наявності (N)».
    totalLotsCount: lots.length,
    claims,
    supplierPrices,
    edit: {
      season: product.season ?? "",
      quality: product.quality ?? "",
      gender: product.gender ?? "",
      country: product.country ?? "",
      sizes: product.sizes ?? "",
      unitsPerKg: product.unitsPerKg ?? "",
      unitWeight: product.unitWeight ?? "",
      filling: product.filling ?? "",
      producer: product.producer ?? "",
      receiptName: product.receiptName ?? "",
      packaging: product.packaging ?? "",
      videoUrl: product.videoUrl ?? "",
    },
  };
}

/** Вкладена категорія з ланцюгом батьків (як selected у loadProductCard). */
interface NestedCategory {
  name: string;
  parent?: NestedCategory | null;
}

/**
 * Розгортає шлях категорії корінь→…→категорія. Чиста функція.
 * Захищено від занадто глибоких/циклічних дерев (cap 10).
 */
export function buildCategoryPath(
  category: NestedCategory | null | undefined,
): string[] {
  const chain: string[] = [];
  let node: NestedCategory | null | undefined = category;
  let guard = 0;
  while (node && guard < 10) {
    chain.push(node.name);
    node = node.parent;
    guard++;
  }
  return chain.reverse(); // корінь → лист
}
