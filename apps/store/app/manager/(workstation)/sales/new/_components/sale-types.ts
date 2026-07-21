/**
 * Shared types для UI створення/редагування реалізації (Блок «Реалізація»).
 *
 * `SaleItemDraft` — стан item-rows у формі. На відміну від замовлення, кожен
 * рядок несе `pricePerKg` (ЦенаПродажиВес), опційний `lotId`/`barcode`
 * (заповнюються при скані ШК) та `priceEur` = pricePerKg × weight, де
 * `weight` — **сумарна** вага рядка (мішки вже враховані у вазі, тому на
 * кількість додатково НЕ множимо).
 *
 * `WireSaleItem` — payload рядка, що відправляється у POST/PATCH /sales.
 *
 * Деякі типи (ProductSummary/ClientPickerItem/PriceTypeOption/AgentOption/
 * OrderDeliveryOption) перевикористовуємо з замовлень — re-export, щоб
 * UI-компоненти підбору/клієнта працювали без дублювання.
 */

import { unitPriceForType } from "@/lib/manager/order-pricing";

export type {
  ProductSummary,
  ProductPriceEntry,
  ClientPickerItem,
  PriceTypeOption,
  AgentOption,
  OrderDeliveryOption,
} from "../../../orders/new/_components/types";

/** Лот, резолвлений за ШК (для прив'язки рядка реалізації до конкретного мішка). */
export interface SaleLotSummary {
  id: string;
  barcode: string;
  weight: number;
  quantity: number;
  status: string;
  /** Бронь — для попередження «не моя бронь». */
  reservedByUserId: string | null;
  reservedByName: string | null;
  reservedUntil: string | null;
}

export interface SaleItemDraft {
  uid: string;
  /** Товар рядка (з підбору або резолву ШК). */
  product:
    | import("../../../orders/new/_components/types").ProductSummary
    | null;
  /** Конкретний лот (заповнюється при скані ШК; підбір через прайс → null). */
  lotId: string | null;
  /** Відсканований штрихкод (для довідки/повтору). */
  barcode: string | null;
  /** Кількість мішків (ціле ≥ 1). */
  quantity: number;
  /** Сумарна вага позиції, кг. */
  weight: number;
  /** Ціна за кг (€) — редагована. */
  pricePerKg: number;
  /** Сумарна ціна позиції, € = ціна за кг × вага × мішки. */
  priceEur: number;
  /** Підставлена ціна — акційна (для підсвічування рядка «Акція»). */
  isAkciya?: boolean;
}

export interface WireSaleItem {
  productId: string;
  lotId: string | null;
  barcode: string | null;
  pricePerKg: number;
  weight: number;
  quantity: number;
  priceEur: number;
}

/**
 * Сумарна ціна рядка = ціна за кг × **сумарна** вага рядка (округлення до
 * копійок). `weight` уже включає всі мішки (див. `changeBags`/підбір), тому на
 * кількість додатково НЕ множимо — інакше сума подвоювалась би при quantity>1.
 */
export function lineTotalEur(pricePerKg: number, weight: number): number {
  return Math.round(pricePerKg * weight * 100) / 100;
}

/**
 * Парсить рядок числового вводу (ціна/мішки) у число.
 *
 * Приймає крапку АБО кому як десятковий роздільник, прибирає пробіли, трактує
 * порожнє / частковий ввід («», «.», «0.») як 0 для розрахунку. Від'ємні та
 * нечислові — 0. Використовується інлайновим numeric-полем, щоб не «прилипав»
 * провідний нуль (Fix 5): поле тримає рядок, а сюди передається для калькуляцій.
 */
export function parseNumericInput(raw: string): number {
  const cleaned = raw.replace(/\s+/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "." || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Нормалізує рядок числового вводу для відображення: дозволяє порожнє та
 * частковий ввід, замінює кому на крапку, прибирає провідні нулі (окрім «0.»).
 * Не округлює — користувач може друкувати «0.05» по символах.
 */
export function sanitizeNumericText(raw: string): string {
  let v = raw.replace(",", ".");
  // Лишаємо лише цифри + одну крапку.
  v = v.replace(/[^\d.]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
  }
  // Прибираємо провідні нулі («07» → «7»), але лишаємо «0.5» та «0».
  v = v.replace(/^0+(?=\d)/, "");
  return v;
}

/**
 * Копіює ціну за кг з рядка `sourceUid` на **усі рядки того самого товару**
 * (за `product.id`) та перераховує `priceEur` кожного скопійованого рядка.
 * Mirrors 1С `ПовторитьЦену`. Чиста функція (без I/O) — покрита тестами.
 *
 * Якщо рядок-джерело не знайдено або у нього немає товару — повертає вхід без
 * змін. Рядки без товару (порожні чернетки) пропускаються.
 */
export function repeatPriceForProduct(
  items: SaleItemDraft[],
  sourceUid: string,
): SaleItemDraft[] {
  const source = items.find((i) => i.uid === sourceUid);
  if (!source || !source.product) return items;
  const productId = source.product.id;
  const unit = source.pricePerKg;
  return items.map((row) => {
    if (row.uid === sourceUid) return row;
    if (!row.product || row.product.id !== productId) return row;
    return {
      ...row,
      pricePerKg: unit,
      priceEur: lineTotalEur(unit, row.weight),
      isAkciya: source.isAkciya ?? false,
    };
  });
}

/** Структуровані реф-и/назви адреси Нової Пошти (місто + відділення). */
export interface NpAddressRefs {
  cityRef: string;
  cityName: string;
  warehouseRef: string;
  warehouseName: string;
}

/** Мінімальне джерело реф-ів НП (реалізація або картка клієнта). */
export interface NpRefSource {
  npCityRef?: string | null;
  npCityName?: string | null;
  npWarehouseRef?: string | null;
  npWarehouseName?: string | null;
}

/**
 * Обирає початкову адресу НП для форми реалізації. На редагуванні збережені
 * реф-и самого документа перемагають; якщо їх немає (новий документ або документ
 * без адреси) — падаємо на «звірену» адресу картки клієнта. Коли обидва порожні
 * — повертає порожні рядки (пікер відкриється чистим).
 *
 * Чиста функція (без I/O) — покрита тестами.
 */
export function resolveInitialNpAddress(
  initialSale: NpRefSource | null | undefined,
  initialClient: NpRefSource | null | undefined,
): NpAddressRefs {
  if (initialSale?.npCityRef) {
    return {
      cityRef: initialSale.npCityRef,
      cityName: initialSale.npCityName ?? "",
      warehouseRef: initialSale.npWarehouseRef ?? "",
      warehouseName: initialSale.npWarehouseName ?? "",
    };
  }
  if (initialClient?.npCityRef) {
    return {
      cityRef: initialClient.npCityRef,
      cityName: initialClient.npCityName ?? "",
      warehouseRef: initialClient.npWarehouseRef ?? "",
      warehouseName: initialClient.npWarehouseName ?? "",
    };
  }
  return { cityRef: "", cityName: "", warehouseRef: "", warehouseName: "" };
}

/** Одне відхилення ціни рядка від еталонної (для попередження перед проведенням). */
export interface PriceDeviation {
  name: string;
  /** Еталонна ціна/кг (з типу цін `wholesale`). */
  expected: number;
  /** Введена менеджером ціна/кг. */
  actual: number;
}

/**
 * Контроль відхилення ціни (1С `ПеревіркаЦіни`). Для кожного рядка з відомим
 * еталоном порівнює введену ціну/кг з еталонною (продажна `wholesale`); якщо
 * `|actual − expected| > threshold` (за замовч. 0.20 €) — додає у список.
 *
 * Рядки без товару та без еталонної ціни (немає з чим порівнювати) пропускаються.
 * Чиста функція (без I/O) — покрита тестами.
 */
export function collectPriceDeviations(
  items: SaleItemDraft[],
  threshold = 0.2,
): PriceDeviation[] {
  const out: PriceDeviation[] = [];
  for (const row of items) {
    if (!row.product) continue;
    const ref = unitPriceForType(row.product.prices, "wholesale");
    if (ref == null) continue;
    // Округлюємо відхилення до копійок, щоб float-шум (напр. 4.2−4.0=0.2000…18)
    // не робив рівно-порогове відхилення хибним порушником.
    const deviation = Math.round(Math.abs(row.pricePerKg - ref) * 100) / 100;
    if (deviation > threshold) {
      out.push({
        name: row.product.name,
        expected: ref,
        actual: row.pricePerKg,
      });
    }
  }
  return out;
}

/** Мінімальна форма броні лота для перевірки «чужа активна бронь». */
export interface LotReservationInfo {
  reservedByUserId: string | null;
  reservedUntil: string | null;
}

/**
 * Перевірка чужої активної броні мішка (1С `АктивнаБроньМішка`). Повертає
 * `true`, коли лот заброньований **іншим** користувачем і бронь ще активна
 * (`reservedUntil` у майбутньому). Своя бронь, протермінована або відсутня → `false`.
 *
 * Чиста функція (без I/O) — покрита тестами.
 */
export function isForeignActiveReservation(
  lot: LotReservationInfo,
  currentUserId: string,
  now: number,
): boolean {
  if (!lot.reservedUntil || !lot.reservedByUserId) return false;
  const until = new Date(lot.reservedUntil).getTime();
  if (!Number.isFinite(until) || until <= now) return false;
  return lot.reservedByUserId !== currentUserId;
}

/**
 * Перетворює draft на payload рядка реалізації. На відміну від замовлення,
 * `lotId`/`barcode` зберігаються (скан ШК прив'язує до конкретного мішка).
 * Повертає `null` для рядків без товару (порожні чернетки авто-видаляються).
 */
export function draftToWire(draft: SaleItemDraft): WireSaleItem | null {
  if (!draft.product) return null;
  return {
    productId: draft.product.id,
    lotId: draft.lotId,
    barcode: draft.barcode,
    pricePerKg: draft.pricePerKg,
    weight: draft.weight,
    quantity: draft.quantity,
    priceEur: draft.priceEur,
  };
}

/**
 * Початкові значення реалізації для режиму редагування (Етап 2).
 * Передаються з server-page детальної реалізації.
 */
export interface SaleEditInitial {
  id: string;
  /** Номер документа для відображення (code1C або docNumber). */
  displayNumber: string;
  status: string;
  notes: string;
  priceTypeId: string | null;
  deliveryMethod: string | null;
  novaPoshtaBranch: string | null;
  /** Реф-и/назви обраного відділення НП (для показу пікера при редагуванні). */
  npCityRef: string | null;
  npCityName: string | null;
  npWarehouseRef: string | null;
  npWarehouseName: string | null;
  npDeliveryType: string | null;
  /** ПІБ отримувача ТТН (Нова Пошта). */
  npRecipientName: string | null;
  /** Телефон отримувача ТТН (Нова Пошта). */
  npRecipientPhone: string | null;
  /** Платник доставки НП: "Recipient" (дефолт) | "Sender". */
  npPayerType: string | null;
  /** Оголошена цінність = сума реалізації (за замовч. увімкнено). */
  declaredValueEnabled: boolean;
  deliveryAddress: string | null;
  cashOnDelivery: boolean;
  assignedAgentUserId: string | null;
  onTradeAgent: boolean;
  expressWaybill: string | null;
  items: SaleItemDraft[];
}
