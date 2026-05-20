import { Prisma } from "@ltex/db";

/**
 * Manager «Прайс» — Stage 3b global lots list helpers.
 *
 * Чисті (DB-agnostic) функції: будують Prisma `where` для глобального списку
 * УСІХ лотів («Деталі по мішках / Наявні лоти» — 1С форма
 * ФормаДеталиХарактеристик) + серіалізують лот у плаский рядок для UI.
 *
 * Дані спільні з магазином (`Lot` / `Product` / `Barcode`) — нічого не дублюємо.
 *
 * Базовий жорсткий фільтр списку — залишок є (`weight > 0`).
 *
 * Бронь (статус-фільтр) — на базі `Lot.status` + reserved* полів (Етап 4):
 *  • free     — вільні (немає активної броні);
 *  • reserved — заброньовані (status === "reserved");
 *  • my       — моя активна бронь (reservedByUserId === поточний user І
 *               reservedUntil ≥ now);
 *  • expired  — протермінована бронь (reserved, але reservedUntil < now).
 */

/** Статус-фільтр броні. */
export type LotsListStatus = "all" | "free" | "reserved" | "my" | "expired";

/** Сортування глобального списку лотів. */
export type LotsListSort = "product" | "arrival" | "weight";
export type LotsListSortDir = "asc" | "desc";

export interface BuildLotsWhereParams {
  /** Пошук по штрихкоду лоту + назві/артикулу товару (insensitive). */
  q?: string;
  /** Префільтр по конкретному товару (з картки товару, Етап 2). */
  productId?: string;
  /** Лише цільові лоти (`isTarget`). */
  target?: boolean;
  /** Лише лоти з відео (`videoUrl != null`). */
  hasVideo?: boolean;
  /** Лише лоти із залишком (`weight > 0`). Дефолт списку — true. */
  onlyInStock?: boolean;
  /**
   * Статус-фільтр броні:
   *  • `free`     — вільні;
   *  • `reserved` — заброньовані;
   *  • `my`       — моя активна бронь (потрібен `viewerUserId` + `now`);
   *  • `expired`  — протермінована бронь (потрібен `now`);
   *  • `all`      — будь-який статус.
   */
  status?: LotsListStatus;
  /** id поточного менеджера — для статусу `my`. */
  viewerUserId?: string;
  /** Поточний момент — для `my` / `expired` (за замовчуванням new Date()). */
  now?: Date;
}

/**
 * Будує `where` для `prisma.lot.findMany`. Чиста функція — без I/O.
 *
 * Базова інваріанта: список лотів завжди показує лише ті, що мають залишок
 * (`weight > 0`), якщо `onlyInStock !== false`. Окремий чекбокс «На складі»
 * у UI лише робить це явним — він не може зменшити базовий фільтр.
 */
export function buildLotsWhere(p: BuildLotsWhereParams): Prisma.LotWhereInput {
  const and: Prisma.LotWhereInput[] = [];

  // Базовий жорсткий фільтр — залишок є. onlyInStock=false вимикає його явно
  // (напр. адмін хоче побачити порожні мішки), інакше завжди true.
  if (p.onlyInStock !== false) {
    and.push({ weight: { gt: 0 } });
  }

  if (p.q && p.q.trim().length > 0) {
    const q = p.q.trim();
    and.push({
      OR: [
        { barcode: { contains: q, mode: "insensitive" } },
        { product: { name: { contains: q, mode: "insensitive" } } },
        { product: { articleCode: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  if (p.productId) {
    and.push({ productId: p.productId });
  }

  if (p.target) {
    and.push({ isTarget: true });
  }

  if (p.hasVideo) {
    and.push({ videoUrl: { not: null } });
  }

  // Статус-фільтр броні. «all» нічого не додає.
  const now = p.now ?? new Date();
  if (p.status === "free") {
    and.push({ status: "free" });
  } else if (p.status === "reserved") {
    and.push({ status: "reserved" });
  } else if (p.status === "my") {
    // Моя активна бронь: я забронював І ще не минув термін.
    and.push({
      reservedByUserId: p.viewerUserId ?? "__none__",
      reservedUntil: { gte: now },
    });
  } else if (p.status === "expired") {
    // Протермінована бронь: є дата, але вже минула.
    and.push({ reservedUntil: { lt: now } });
  }

  return and.length > 0 ? { AND: and } : {};
}

/**
 * orderBy для findMany.
 *  • `product` — групування за товаром: сортуємо за артикулом, далі назвою.
 *  • `arrival` — за датою приходу (proxy: createdAt — Prisma не coalesce-ить
 *    у orderBy; arrivalDate може бути null).
 *  • `weight`  — за вагою лоту.
 *
 * Для стабільного групування у UI завжди додаємо вторинне сортування за
 * товаром, а в межах товару — за вагою.
 */
export function buildLotsOrderBy(
  sort: LotsListSort,
  dir: LotsListSortDir,
): Prisma.LotOrderByWithRelationInput[] {
  if (sort === "arrival") {
    return [{ createdAt: dir }, { id: "asc" }];
  }
  if (sort === "weight") {
    return [{ weight: dir }, { id: "asc" }];
  }
  // product (default): за артикулом → назвою → вагою (для групування).
  return [
    { product: { articleCode: dir } },
    { product: { name: dir } },
    { weight: "desc" },
  ];
}

// ─── Серіалізація рядка ─────────────────────────────────────────────────────

export interface RawLotRow {
  id: string;
  barcode: string;
  weight: number;
  quantity: number;
  status: string;
  sector: string | null;
  videoUrl: string | null;
  videoDate: Date | null;
  isTarget: boolean;
  isOpen: boolean;
  reservedForName: string | null;
  reservedByUserId: string | null;
  reservedUntil: Date | null;
  product: {
    id: string;
    articleCode: string | null;
    name: string;
    slug: string;
  };
}

export interface LotListItem {
  id: string;
  barcode: string;
  weight: number;
  quantity: number;
  status: string;
  sector: string | null;
  videoUrl: string | null;
  videoDateIso: string | null;
  isTarget: boolean;
  isOpen: boolean;
  /** Похідне — статус reserved (для бурштинового підсвічування). */
  isReserved: boolean;
  /** Похідне — наявність відео (для зеленого підсвічування). */
  hasVideo: boolean;
  // ── Бронь (Етап 4) — для дисплею в таблиці ──
  /** Ім'я клієнта, на якого заброньовано (для показу). */
  reservedForName: string | null;
  /** Дата «до якої діє бронь» (ISO) або null. */
  reservedUntilIso: string | null;
  /** Бронь активна (reservedUntil ще не минув) на момент серіалізації. */
  isActiveReservation: boolean;
  /** Активна бронь належить поточному менеджеру. */
  isMineReservation: boolean;
  product: {
    id: string;
    articleCode: string | null;
    name: string;
    slug: string;
  };
}

/**
 * Перетворює raw-лот (з findMany include) у плаский рядок списку.
 * Чиста функція — без I/O. `viewerUserId`/`now` — для похідних флагів броні.
 */
export function serializeLotRow(
  l: RawLotRow,
  viewerUserId?: string,
  now: Date = new Date(),
): LotListItem {
  const isActive = l.reservedUntil
    ? l.reservedUntil.getTime() >= now.getTime()
    : false;
  return {
    id: l.id,
    barcode: l.barcode,
    weight: l.weight,
    quantity: l.quantity,
    status: l.status,
    sector: l.sector,
    videoUrl: l.videoUrl,
    videoDateIso: l.videoDate ? l.videoDate.toISOString() : null,
    isTarget: l.isTarget,
    isOpen: l.isOpen,
    isReserved: l.status === "reserved",
    hasVideo: l.videoUrl !== null,
    reservedForName: l.reservedForName,
    reservedUntilIso: l.reservedUntil ? l.reservedUntil.toISOString() : null,
    isActiveReservation: isActive,
    isMineReservation:
      isActive &&
      viewerUserId !== undefined &&
      l.reservedByUserId === viewerUserId,
    product: {
      id: l.product.id,
      articleCode: l.product.articleCode,
      name: l.product.name,
      slug: l.product.slug,
    },
  };
}

/** Prisma `select` для рядка лоту — узгоджено з RawLotRow. */
export const lotRowSelect = {
  id: true,
  barcode: true,
  weight: true,
  quantity: true,
  status: true,
  sector: true,
  videoUrl: true,
  videoDate: true,
  isTarget: true,
  isOpen: true,
  reservedForName: true,
  reservedByUserId: true,
  reservedUntil: true,
  product: {
    select: { id: true, articleCode: true, name: true, slug: true },
  },
} satisfies Prisma.LotSelect;

// ─── Групування за товаром (для UI) ─────────────────────────────────────────

export interface LotGroup {
  productId: string;
  articleCode: string | null;
  productName: string;
  productSlug: string;
  lots: LotListItem[];
}

/**
 * Групує плаский (вже відсортований) список лотів за товаром, зберігаючи
 * порядок першої появи товару. Чиста функція — без I/O.
 */
export function groupLotsByProduct(items: LotListItem[]): LotGroup[] {
  const groups: LotGroup[] = [];
  const index = new Map<string, LotGroup>();

  for (const item of items) {
    let group = index.get(item.product.id);
    if (!group) {
      group = {
        productId: item.product.id,
        articleCode: item.product.articleCode,
        productName: item.product.name,
        productSlug: item.product.slug,
        lots: [],
      };
      index.set(item.product.id, group);
      groups.push(group);
    }
    group.lots.push(item);
  }

  return groups;
}
