import { z } from "zod";
import { ORDER_DELIVERY_CODES } from "@/lib/manager/order-delivery";
import { MANAGER_SALE_STATUSES } from "@/lib/manager/sale-status";

/**
 * Zod schema для POST /api/v1/manager/sales body (Блок «Реалізація», Етап 2).
 *
 * Адаптовано з `manager-order.ts`. Відмінності реалізації від замовлення:
 *  - кожен рядок несе `pricePerKg` (ЦенаПродажиВес) — ціна за кг, та опційний
 *    `lotId`/`barcode` (заповнюються при скані ШК; при підборі через прайс —
 *    `lotId` = null, «загальна позиція»);
 *  - `priceEur` рядка — сумарна ціна позиції = pricePerKg × weight × quantity;
 *  - знімок курсу EUR + USD (`exchangeRateEur`/`exchangeRateUsd`);
 *  - `novaPoshtaBranch` (№ відділення НП), `expressWaybill` (ТТН),
 *    `onTradeAgent` (на торгового контрагента).
 *
 * **БЕЗ окремої «знижки» на рядку** — менеджер редагує ціну за кг вручну.
 */
export const saleItemInputSchema = z.object({
  productId: z.string().min(1),
  /** `null` = загальна позиція (підбір через прайс); конкретний lot — при скані ШК. */
  lotId: z.string().nullable().optional(),
  /** Відсканований штрихкод лота (для довідки/повторного резолву). */
  barcode: z.string().nullable().optional(),
  /** Ціна за кг (€) — ЦенаПродажиВес. */
  pricePerKg: z.number().nonnegative().max(100_000),
  /** Вага позиції, кг (вага мішка × мішки). */
  weight: z.number().positive().max(10_000),
  /** Кількість мішків. */
  quantity: z.number().int().positive().max(10_000).default(1),
  /** Сумарна ціна рядка (€) = pricePerKg × weight × quantity. */
  priceEur: z.number().nonnegative().max(1_000_000),
});

export const createSaleSchema = z.object({
  customerId: z.string().min(1),
  notes: z.string().max(2000).optional(),
  /** Знімок курсу EUR→UAH на документі. */
  exchangeRateEur: z.number().positive().max(1000).optional(),
  /** Знімок курсу USD→UAH на документі. */
  exchangeRateUsd: z.number().positive().max(1000).optional(),
  items: z.array(saleItemInputSchema).min(1).max(200),

  // ─── Manager sale fields (← 1С Document.РеализацияТоваровУслуг) ───────────
  /** Тип цін — `MgrPriceType.id` (рядки перераховуються за ним у UI). */
  priceTypeId: z.string().min(1).nullable().optional(),
  /** Спосіб доставки — delivery|post|pickup. */
  deliveryMethod: z
    .enum(ORDER_DELIVERY_CODES as [string, ...string[]])
    .nullable()
    .optional(),
  /** № відділення Нової Пошти. */
  novaPoshtaBranch: z.string().max(20).nullable().optional(),
  /** Наложка (післяплата). */
  cashOnDelivery: z.boolean().optional().default(false),
  /** Торговий агент, кому зараховано продаж (`User.id`). */
  assignedAgentUserId: z.string().min(1).nullable().optional(),
  /** «На торгового контрагента» — продаж зараховується агенту клієнта (дефолт true). */
  onTradeAgent: z.boolean().optional().default(true),
  /** Вивантажувати в 1С (дефолт true). */
  exportTo1C: z.boolean().optional().default(true),
  /** Експрес-накладна / ТТН. */
  expressWaybill: z.string().max(60).nullable().optional(),
  /**
   * Зворотне посилання на Маршрутний лист (1С `РеализацияТоваровУслуг.
   * МаршрутныйЛист`). Заповнюється коли реалізацію створено зсередини МЛ
   * (`/manager/sales/new?routeSheetId=...`). Існування МЛ перевіряє endpoint.
   */
  routeSheetId: z.string().min(1).nullable().optional(),
});

/**
 * Zod schema для PATCH /api/v1/manager/sales/[id] body (Етап 2 — редагування).
 *
 * Той самий набір полів, що й `createSaleSchema` (повна заміна шапки + items),
 * але без `customerId` (клієнт реалізації не змінюється) та з опційним
 * `status` — дозволяє разом зі збереженням змінити статус документа
 * (валідність переходу перевіряє endpoint через `isSaleTransitionAllowed`).
 */
export const updateSaleSchema = z.object({
  notes: z.string().max(2000).nullable().optional(),
  exchangeRateEur: z.number().positive().max(1000).optional(),
  exchangeRateUsd: z.number().positive().max(1000).optional(),
  items: z.array(saleItemInputSchema).min(1).max(200),

  // ─── Manager sale fields ──────────────────────────────────────────────────
  priceTypeId: z.string().min(1).nullable().optional(),
  deliveryMethod: z
    .enum(ORDER_DELIVERY_CODES as [string, ...string[]])
    .nullable()
    .optional(),
  novaPoshtaBranch: z.string().max(20).nullable().optional(),
  cashOnDelivery: z.boolean().optional().default(false),
  assignedAgentUserId: z.string().min(1).nullable().optional(),
  onTradeAgent: z.boolean().optional().default(true),
  exportTo1C: z.boolean().optional().default(true),
  expressWaybill: z.string().max(60).nullable().optional(),

  // ─── Status (Етап 2) ──────────────────────────────────────────────────────
  /** Бажаний наступний статус документа (валідність переходу — у endpoint). */
  status: z.enum(MANAGER_SALE_STATUSES).optional(),
});

export type SaleItemInput = z.infer<typeof saleItemInputSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
/** Pre-parse shape (defaults optional) — приймається `createSaleWithItems`. */
export type CreateSaleInputRaw = z.input<typeof createSaleSchema>;
export type UpdateSaleInput = z.infer<typeof updateSaleSchema>;
/** Pre-parse shape (defaults optional) — приймається `updateSaleWithItems`. */
export type UpdateSaleInputRaw = z.input<typeof updateSaleSchema>;
