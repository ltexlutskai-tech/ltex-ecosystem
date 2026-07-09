import { z } from "zod";
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
  weight: z.number().positive().max(1_000_000),
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
  /** Спосіб доставки — код запису довідника «Способи доставки» (7.3). */
  deliveryMethod: z.string().max(50).nullable().optional(),
  /** № відділення Нової Пошти. */
  novaPoshtaBranch: z.string().max(20).nullable().optional(),
  /** Наложка (післяплата). */
  cashOnDelivery: z.boolean().optional().default(false),
  /** Торговий агент, кому зараховано продаж (`User.id`). */
  assignedAgentUserId: z.string().min(1).nullable().optional(),
  /** «На торгового контрагента» — продаж зараховується агенту клієнта (дефолт true). */
  onTradeAgent: z.boolean().optional().default(true),
  /**
   * Deprecated — більше не керується з UI (1С-вивантаження прибрано). Лишено
   * опційним для зворотної сумісності зі старими payload-ами.
   */
  exportTo1C: z.boolean().optional().default(true),
  /**
   * Провести документ при збереженні (= status `posted` + `archived`). Кнопка
   * «Зберегти та провести». Falsy → зберегти як чернетку / без зміни статусу.
   */
  post: z.boolean().optional(),
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
  deliveryMethod: z.string().max(50).nullable().optional(),
  novaPoshtaBranch: z.string().max(20).nullable().optional(),
  cashOnDelivery: z.boolean().optional().default(false),
  assignedAgentUserId: z.string().min(1).nullable().optional(),
  onTradeAgent: z.boolean().optional().default(true),
  /** Deprecated — див. createSaleSchema. Лишено опційним для back-compat. */
  exportTo1C: z.boolean().optional().default(true),
  /** Провести документ при збереженні (= status `posted` + `archived`). */
  post: z.boolean().optional(),
  expressWaybill: z.string().max(60).nullable().optional(),

  // ─── Status (Етап 2) ──────────────────────────────────────────────────────
  /** Бажаний наступний статус документа (валідність переходу — у endpoint). */
  status: z.enum(MANAGER_SALE_STATUSES).optional(),
});

/**
 * Zod schema для **чернеткового** (draft) режиму реалізації (autosave).
 *
 * Послаблена версія strict-схем: усі поля опційні, `items` можуть бути порожні
 * — щоб чернетка зберігалась «з першого символу», навіть напівпорожня.
 * Використовується у POST/PATCH коли body містить `draft === true`.
 *
 * ⚠️ Грошова безпека: draft НЕ проводить документ (`post` тут відсутній) — рухи
 * боргу/складу/собівартості пишуться ЛИШЕ при «Провести» (strict-схема + post).
 *
 * `customerId` тут опційний (для PATCH draft клієнт не потрібен), але POST draft
 * все одно вимагає його на рівні endpoint — `Sale.customerId` є обов'язковим FK,
 * тож draft-рядок не може існувати без клієнта (до вибору клієнта прогрес
 * захищає локальна копія у localStorage — рівень 1 автозбереження).
 */
export const saleDraftSchema = z.object({
  /** Прапорець draft-режиму — endpoint обирає цю схему коли `true`. */
  draft: z.literal(true),
  customerId: z.string().min(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  exchangeRateEur: z.number().positive().max(1000).optional(),
  exchangeRateUsd: z.number().positive().max(1000).optional(),
  /** Рядки повні (форма фільтрує неповні) — але масив може бути порожнім. */
  items: z.array(saleItemInputSchema).max(200).optional(),
  priceTypeId: z.string().min(1).nullable().optional(),
  deliveryMethod: z.string().max(50).nullable().optional(),
  novaPoshtaBranch: z.string().max(20).nullable().optional(),
  cashOnDelivery: z.boolean().optional(),
  assignedAgentUserId: z.string().min(1).nullable().optional(),
  onTradeAgent: z.boolean().optional(),
  expressWaybill: z.string().max(60).nullable().optional(),
  routeSheetId: z.string().min(1).nullable().optional(),
});

export type SaleItemInput = z.infer<typeof saleItemInputSchema>;
export type SaleDraftInput = z.infer<typeof saleDraftSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
/** Pre-parse shape (defaults optional) — приймається `createSaleWithItems`. */
export type CreateSaleInputRaw = z.input<typeof createSaleSchema>;
export type UpdateSaleInput = z.infer<typeof updateSaleSchema>;
/** Pre-parse shape (defaults optional) — приймається `updateSaleWithItems`. */
export type UpdateSaleInputRaw = z.input<typeof updateSaleSchema>;
