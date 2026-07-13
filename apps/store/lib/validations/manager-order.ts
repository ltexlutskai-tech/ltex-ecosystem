import { z } from "zod";
import { MANAGER_ORDER_STATUSES } from "@/lib/manager/order-status";

/**
 * Zod schema для POST /api/v1/manager/orders body.
 *
 * Item shape: `lotId` nullable — `null` означає "загальна позиція" (1С обере
 * вільний лот пізніше); конкретний lotId — bind на конкретний bag/lot з
 * known barcode. Це віддзеркалює `OrderItem.lotId` nullable з міграції
 * `20260502_product_attrs_lot_optional`.
 *
 * `exchangeRate` optional — якщо не передано, server підставить
 * `getCurrentRate()` (current EUR→UAH з 1С feed).
 */
export const orderItemInputSchema = z.object({
  productId: z.string().min(1),
  lotId: z.string().nullable().optional(),
  weight: z.number().positive().max(1_000_000),
  quantity: z.number().int().positive().max(10_000).default(1),
  priceEur: z.number().nonnegative().max(1_000_000),
});

export const createOrderSchema = z.object({
  customerId: z.string().min(1),
  notes: z.string().max(2000).optional(),
  exchangeRate: z.number().positive().max(1000).optional(),
  items: z.array(orderItemInputSchema).min(1).max(200),

  // ─── Manager order fields (← 1С Document.Заказ, Етап 1) ──────────────────
  /** Тип цін — `MgrPriceType.id` (рядки перераховуються за ним у UI). */
  priceTypeId: z.string().min(1).nullable().optional(),
  /**
   * Термін до нагадування (днів) — ОБОВ'ЯЗКОВЕ (8.1): менеджер задає, через
   * скільки днів нагадати закрити/переробити замовлення. Спосіб доставки
   * прибрано, авто-нагадування ведеться лише за цим полем.
   */
  overdueDays: z.number().int().positive().max(3650),
  /** Наложка (післяплата). */
  cashOnDelivery: z.boolean().optional().default(false),
  /** Торговий агент, кому зараховано продаж (`User.id`); дефолт — поточний. */
  assignedAgentUserId: z.string().min(1).nullable().optional(),
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

  /**
   * Форсоване створення другого активного замовлення (N1). Дозволено лише
   * admin/owner/senior_manager — старі активні замовлення цього клієнта
   * втрачають `isActual`. Можна також передати через `?force=true`.
   */
  force: z.boolean().optional(),
});

/**
 * Zod schema для PATCH /api/v1/manager/orders/[id] body (Етап 2 — редагування).
 *
 * Той самий набір полів, що й `createOrderSchema` (повна заміна шапки + items),
 * але без `customerId` (клієнт замовлення не змінюється при редагуванні) та з
 * опційним `status` — дозволяє разом зі збереженням змінити статус документа
 * (валідність переходу перевіряє endpoint через `isTransitionAllowed`).
 */
export const updateOrderSchema = z.object({
  notes: z.string().max(2000).nullable().optional(),
  exchangeRate: z.number().positive().max(1000).optional(),
  items: z.array(orderItemInputSchema).min(1).max(200),

  // ─── Manager order fields (← 1С Document.Заказ, Етап 1) ──────────────────
  priceTypeId: z.string().min(1).nullable().optional(),
  /** Термін до нагадування (днів) — ОБОВ'ЯЗКОВЕ (8.1), як у createOrderSchema. */
  overdueDays: z.number().int().positive().max(3650),
  cashOnDelivery: z.boolean().optional().default(false),
  assignedAgentUserId: z.string().min(1).nullable().optional(),
  /** Deprecated — див. createOrderSchema. Лишено опційним для back-compat. */
  exportTo1C: z.boolean().optional().default(true),
  /** Провести документ при збереженні (= status `posted` + `archived`). */
  post: z.boolean().optional(),

  // ─── Status (Етап 2) ──────────────────────────────────────────────────────
  /** Бажаний наступний статус документа (валідність переходу — у endpoint). */
  status: z.enum(MANAGER_ORDER_STATUSES).optional(),

  // ─── Актуальність документа (1С «Статус заказа: Актуальне») ──────────────
  /**
   * Актуальність замовлення. Менеджер може зняти/повернути «Актуальне» прямо
   * у картці. Заборонено ставити `true` на закритому/архівному замовленні —
   * guard у endpoint.
   */
  isActual: z.boolean().optional(),

  // ─── Optimistic lock (Етап 4 блоку Замовлення, 2026-06-09) ───────────────
  // Клієнт надсилає поточну версію документа що бачив. Backward-compat —
  // якщо не передано, перевірка пропускається.
  version: z.number().int().optional(),
});

/**
 * Zod schema для **чернеткового** (draft) режиму замовлення (autosave).
 *
 * Послаблена версія strict-схем: усі поля опційні, `items` можуть бути порожні
 * — щоб чернетка зберігалась «з першого символу», навіть напівпорожня.
 * Використовується у POST/PATCH коли body містить `draft === true`.
 *
 * ⚠️ Грошова безпека: draft НЕ проводить документ (`post` тут відсутній) — рухи
 * складу/боргу з'являються ЛИШЕ при «Провести» (strict-схема + post).
 *
 * `customerId` тут опційний (для PATCH draft клієнт не потрібен), але POST draft
 * все одно вимагає його на рівні endpoint — `Order.customerId` є обов'язковим FK,
 * тож draft-рядок не може існувати без клієнта (до вибору клієнта прогрес
 * захищає локальна копія у localStorage — рівень 1 автозбереження).
 */
export const orderDraftSchema = z.object({
  /** Прапорець draft-режиму — endpoint обирає цю схему коли `true`. */
  draft: z.literal(true),
  customerId: z.string().min(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  exchangeRate: z.number().positive().max(1000).optional(),
  /** Рядки повні (форма фільтрує неповні) — але масив може бути порожнім. */
  items: z.array(orderItemInputSchema).max(200).optional(),
  priceTypeId: z.string().min(1).nullable().optional(),
  /** Термін до нагадування (днів) — у чернетці опційний (автозбереження). */
  overdueDays: z.number().int().positive().max(3650).nullable().optional(),
  cashOnDelivery: z.boolean().optional(),
  assignedAgentUserId: z.string().min(1).nullable().optional(),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type OrderDraftInput = z.infer<typeof orderDraftSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
/** Pre-parse shape (defaults optional) — приймається `createOrderWithItems`. */
export type CreateOrderInputRaw = z.input<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
/** Pre-parse shape (defaults optional) — приймається `updateOrderWithItems`. */
export type UpdateOrderInputRaw = z.input<typeof updateOrderSchema>;
