import { isActiveReservation } from "@/lib/manager/lot-booking";

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
  product: { id: string; name: string; slug: string };
  barcodes: { id: string; code: string; type: string }[];
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
