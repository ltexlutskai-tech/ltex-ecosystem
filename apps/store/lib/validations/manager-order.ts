import { z } from "zod";
import { ORDER_DELIVERY_CODES } from "@/lib/manager/order-delivery";
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
  /** Спосіб доставки — delivery|post|pickup. */
  deliveryMethod: z
    .enum(ORDER_DELIVERY_CODES as [string, ...string[]])
    .nullable()
    .optional(),
  /** Наложка (післяплата). */
  cashOnDelivery: z.boolean().optional().default(false),
  /** Торговий агент, кому зараховано продаж (`User.id`); дефолт — поточний. */
  assignedAgentUserId: z.string().min(1).nullable().optional(),
  /** Вивантажувати в 1С (дефолт true). */
  exportTo1C: z.boolean().optional().default(true),

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
  deliveryMethod: z
    .enum(ORDER_DELIVERY_CODES as [string, ...string[]])
    .nullable()
    .optional(),
  cashOnDelivery: z.boolean().optional().default(false),
  assignedAgentUserId: z.string().min(1).nullable().optional(),
  exportTo1C: z.boolean().optional().default(true),

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

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
/** Pre-parse shape (defaults optional) — приймається `createOrderWithItems`. */
export type CreateOrderInputRaw = z.input<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
/** Pre-parse shape (defaults optional) — приймається `updateOrderWithItems`. */
export type UpdateOrderInputRaw = z.input<typeof updateOrderSchema>;
