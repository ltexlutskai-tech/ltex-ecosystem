import { Prisma } from "@ltex/db";
import { isActiveReservation } from "@/lib/manager/lot-booking";
import {
  BASE_PRICE_TYPE,
  SALE_PRICE_TYPE,
  newProductCutoff,
} from "@/lib/manager/prices";

/**
 * Спільний Prisma `include` для картки лоту (GET / book / unbook). Тримаємо в
 * одному місці щоб усі endpoint-и віддавали узгоджену форму (зокрема дані
 * товара для share-тексту Stage 5a).
 */
export const lotCardInclude = {
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      articleCode: true,
      description: true,
      videoUrl: true,
      createdAt: true,
      prices: {
        where: { priceType: { in: [BASE_PRICE_TYPE, SALE_PRICE_TYPE] } },
        select: { priceType: true, amount: true },
      },
    },
  },
  barcodes: { select: { id: true, code: true, type: true } },
} satisfies Prisma.LotInclude;

/**
 * Manager «Прайс» — спільна серіалізація картки лоту (GET / book / unbook
 * повертають однакову форму). DB-agnostic: приймає вже завантажений лот +
 * штрих-коди, не торкається prisma.
 */

export interface LotCardSource {
  id: string;
  barcode: string;
  weight: number;
  quantity: number;
  status: string;
  priceEur: number;
  videoUrl: string | null;
  arrivalDate: Date | null;
  createdAt: Date;
  sector: string | null;
  isOpen: boolean;
  comment: string | null;
  description: string | null;
  isTarget: boolean;
  videoDate: Date | null;
  reservedForClientId: string | null;
  reservedForName: string | null;
  reservedByUserId: string | null;
  reservedByName: string | null;
  reservedUntil: Date | null;
  /**
   * Товар-власник + його дані для рекламного тексту «Поділитися» (Stage 5a):
   * артикул / опис / ціни (базова + акційна) / дата створення (для «новинки») /
   * відео-URL.
   */
  product: {
    id: string;
    name: string;
    slug: string;
    articleCode: string | null;
    description: string;
    videoUrl: string | null;
    createdAt: Date;
    prices: { priceType: string; amount: number }[];
  };
  barcodes: { id: string; code: string; type: string }[];
}

/** Базова/акційна ціна (€/кг) товара для share-тексту. */
function deriveSharestats(
  product: LotCardSource["product"],
  now: Date,
): {
  articleCode: string | null;
  description: string;
  basePriceEur: number | null;
  salePriceEur: number | null;
  isNew: boolean;
  videoUrl: string | null;
} {
  const prices = product.prices ?? [];
  const base = prices.find((p) => p.priceType === BASE_PRICE_TYPE);
  const sale = prices.find((p) => p.priceType === SALE_PRICE_TYPE);
  const basePriceEur = base ? base.amount : null;
  const salePriceEur =
    sale && (basePriceEur === null || sale.amount < basePriceEur)
      ? sale.amount
      : null;
  return {
    articleCode: product.articleCode,
    description: product.description,
    basePriceEur,
    salePriceEur,
    isNew: product.createdAt.getTime() >= newProductCutoff(now).getTime(),
    videoUrl: product.videoUrl,
  };
}

export function serializeLotCard(
  lot: LotCardSource,
  viewerUserId: string,
  now: Date,
) {
  // Штрих-коди: окрема таблиця Barcode (їх може бути кілька) + основний
  // Lot.barcode. Основний завжди першим, без дублів.
  const extraCodes = lot.barcodes
    .filter((b) => b.code !== lot.barcode)
    .map((b) => ({ id: b.id, code: b.code, type: b.type }));
  const barcodes = [
    { id: "primary", code: lot.barcode, type: "EAN13" },
    ...extraCodes,
  ];

  // Бронь активна якщо reservedUntil ще не минув. Протермінована бронь
  // трактується як вільний лот (можна перебронювати).
  const isActive = isActiveReservation(
    {
      status: lot.status,
      reservedByUserId: lot.reservedByUserId,
      reservedUntil: lot.reservedUntil,
    },
    now,
  );
  const isMine = isActive && lot.reservedByUserId === viewerUserId;

  return {
    id: lot.id,
    product: {
      id: lot.product.id,
      name: lot.product.name,
      slug: lot.product.slug,
    },
    // ── Дані для рекламного тексту «Поділитися» (Stage 5a) ──
    share: deriveSharestats(lot.product, now),
    // ── read-only (дані з 1С) ──
    barcode: lot.barcode,
    barcodes,
    weight: lot.weight,
    quantity: lot.quantity,
    status: lot.status,
    priceEur: lot.priceEur,
    videoUrl: lot.videoUrl,
    arrivalIso: (lot.arrivalDate ?? lot.createdAt).toISOString(),
    // ── менеджерські (редаговані) ──
    sector: lot.sector,
    isOpen: lot.isOpen,
    comment: lot.comment,
    description: lot.description,
    isTarget: lot.isTarget,
    videoDateIso: lot.videoDate ? lot.videoDate.toISOString() : null,
    // ── бронь (Етап 4) ──
    reservation: {
      isReserved: lot.status === "reserved",
      isActive,
      isMine,
      reservedForClientId: lot.reservedForClientId,
      reservedForName: lot.reservedForName,
      reservedByName: lot.reservedByName,
      reservedUntilIso: lot.reservedUntil
        ? lot.reservedUntil.toISOString()
        : null,
    },
  };
}
