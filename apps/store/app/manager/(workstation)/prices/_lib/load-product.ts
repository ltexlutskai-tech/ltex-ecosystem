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
  /** true коли status === "reserved" (бронь — лише показ, Етап 4). */
  isReserved: boolean;
}

export interface ProductCardVM {
  id: string;
  articleCode: string | null;
  name: string;
  slug: string;
  description: string;
  categoryName: string | null;
  videoUrl: string | null;
  priceUnit: string;
  /** Коефіцієнт «одиниць у кг» для toggle «у штуках» (Float, може бути null). */
  unitsPerKg: number | null;
  images: ProductImageVM[];
  /** Базова продажна ціна (wholesale) або null. */
  basePrice: PriceLine | null;
  /** Класифіковані ціни: продажні + постачальника. */
  prices: ClassifiedPrices;
  /** ✔ структуровані факти, тільки заповнені. */
  keyFacts: KeyFact[];
  /** Лічильники характеристик + бронь + залишок. */
  lotStats: CardLotStats;
  /** Усі лоти товару (з залишком) — для розширеної таблиці + картки лоту. */
  lots: ProductLotVM[];
}

export async function loadProductCard(
  id: string,
): Promise<ProductCardVM | null> {
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      articleCode: true,
      name: true,
      slug: true,
      description: true,
      videoUrl: true,
      priceUnit: true,
      unitsPerKgMin: true,
      gender: true,
      sizes: true,
      unitsPerKg: true,
      unitWeight: true,
      quality: true,
      season: true,
      country: true,
      category: { select: { name: true } },
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
        },
      },
    },
  });

  if (!product) return null;

  const rawPrices: RawPrice[] = product.prices.map((p) => ({
    priceType: p.priceType,
    amount: p.amount,
    currency: p.currency,
    validFrom: p.validFrom,
  }));

  const lotStats = computeLotStats(
    product.lots.map((l) => ({
      weight: l.weight,
      status: l.status,
      videoUrl: l.videoUrl,
    })),
  );

  // Усі лоти із залишком (вільні + заброньовані + інші) — менеджеру потрібно
  // бачити й керувати кожним мішком, не лише вільними. Продані з нульовою вагою
  // відсіюємо щоб не захаращувати таблицю.
  const lots: ProductLotVM[] = product.lots
    .filter((l) => l.weight > 0)
    .map((l) => ({
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
    }));

  return {
    id: product.id,
    articleCode: product.articleCode,
    name: product.name,
    slug: product.slug,
    description: product.description,
    categoryName: product.category?.name ?? null,
    videoUrl: product.videoUrl,
    priceUnit: product.priceUnit,
    unitsPerKg: product.unitsPerKgMin,
    images: product.images.map((img) => ({ url: img.url, alt: img.alt })),
    basePrice: basePriceOf(rawPrices),
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
  };
}
