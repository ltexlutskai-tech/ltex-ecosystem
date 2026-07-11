import { z } from "zod";
import { ROUTE_SHEET_STATUS_LIST } from "@/lib/manager/route-sheet-status";

/**
 * Zod-схеми для API маршрутних листів (Блок «Маршрутний лист», Етап 1).
 *
 * - `createRouteSheetSchema` — POST /api/v1/manager/route-sheets (шапка;
 *   усі поля опційні — створюється чернетка, заповнюється далі на формі);
 * - `updateRouteSheetSchema` — PATCH /api/v1/manager/route-sheets/[id]
 *   (редагування полів шапки; усі поля опційні — часткове оновлення);
 * - `addOrdersSchema` — POST /api/v1/manager/route-sheets/[id]/orders
 *   (масив orderIds для додавання).
 */

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

export const createRouteSheetSchema = z.object({
  /** Дата складання (ISO). Дефолт — now() на рівні Prisma. */
  date: isoDate.optional(),
  /** Планова дата приїзду (ISO). */
  arrivalDate: isoDate.nullable().optional(),
  /** Маршрут — `MgrRoute.id`. */
  routeId: z.string().min(1).nullable().optional(),
  /** Експедитор — `User.id`. */
  expeditorUserId: z.string().min(1).nullable().optional(),
  /** Коментар (= «назва» у списку). */
  comment: z.string().max(2000).nullable().optional(),
});

export const updateRouteSheetSchema = z.object({
  date: isoDate.optional(),
  arrivalDate: isoDate.nullable().optional(),
  routeId: z.string().min(1).nullable().optional(),
  expeditorUserId: z.string().min(1).nullable().optional(),
  managerUserId: z.string().min(1).nullable().optional(),
  status: z.enum(ROUTE_SHEET_STATUS_LIST as [string, ...string[]]).optional(),
  comment: z.string().max(2000).nullable().optional(),
  /** Кілометраж (Етап 4). */
  mileageStartKm: z.number().nonnegative().max(9_999_999).nullable().optional(),
  mileageEndKm: z.number().nonnegative().max(9_999_999).nullable().optional(),
  /** Ціна за км для авто-витрат на пробіг (Блок Б, ← 1С ЦенаЗаКМ). */
  pricePerKm: z.number().nonnegative().max(1_000_000).nullable().optional(),
  /** GPS-знімок координат (Етап 4 — best-effort на статус-переходах). */
  gpsLat: z.number().min(-90).max(90).nullable().optional(),
  gpsLng: z.number().min(-180).max(180).nullable().optional(),
});

/** POST /route-sheets/[id]/tasks — додати завдання (вільна нотатка). */
export const addTaskSchema = z.object({
  customerId: z.string().min(1).nullable().optional(),
  comment: z.string().trim().min(1, "Порожній коментар").max(2000),
});

export const addOrdersSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(200),
});

/** PATCH /route-sheets/[id]/orders — новий порядок замовлень у рейсі. */
export const reorderOrdersSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(200),
});

/**
 * POST /route-sheets/[id]/loading — додати рядок Загрузки скануванням ШК.
 * Наповнення лише скануванням (беремо будь-який мішок і скануємо); `orderId` —
 * прив'язка до конкретного замовлення (1С «Загрузка в заказ»), інакше авто.
 */
export const addLoadingSchema = z.object({
  barcode: z.string().trim().min(1, "Не вказано ШК").max(64),
  orderId: z.string().trim().min(1).optional(),
});

/** PATCH /route-sheets/[id]/loading?loadingId= — редагування рядка Загрузки. */
export const updateLoadingSchema = z
  .object({
    loaded: z.boolean().optional(),
    isReturn: z.boolean().optional(),
    weight: z.number().nonnegative().max(9999).optional(),
  })
  .refine(
    (v) =>
      v.loaded !== undefined ||
      v.isReturn !== undefined ||
      v.weight !== undefined,
    { message: "Немає полів для оновлення" },
  );

/** POST /route-sheets/[id]/expenses — додати/оновити рядок витрат (Блок Б). */
export const routeSheetExpenseSchema = z.object({
  articleName: z.string().max(200).nullable().optional(),
  cashFlowArticleId: z.string().min(1).nullable().optional(),
  currency: z.string().max(8).optional(),
  amount: z.number().nonnegative().max(9_999_999),
});

export type CreateRouteSheetInput = z.infer<typeof createRouteSheetSchema>;
export type UpdateRouteSheetInput = z.infer<typeof updateRouteSheetSchema>;
export type AddOrdersInput = z.infer<typeof addOrdersSchema>;
export type AddLoadingInput = z.infer<typeof addLoadingSchema>;
export type UpdateLoadingInput = z.infer<typeof updateLoadingSchema>;
export type AddTaskInput = z.infer<typeof addTaskSchema>;
export type RouteSheetExpenseInput = z.infer<typeof routeSheetExpenseSchema>;
