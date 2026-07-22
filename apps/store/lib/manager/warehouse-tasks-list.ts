import type { Prisma } from "@ltex/db";

/**
 * Блок «Завдання складу» — where/orderBy-білдери для списку.
 *
 * Чисті (DB-agnostic) функції: будують Prisma `where` та `orderBy` для списку
 * складських завдань із URL-параметрів фільтра/сортування. Скоуп видимості
 * (`managerUserId`) задає викликач:
 *  • `null`   — усі завдання (склад/адмін/власник);
 *  • `string` — лише завдання цього менеджера (за реалізацією).
 *
 * Базовий ownership не послаблюється — фільтри лише звужують уже заданий скоуп.
 */

export const WAREHOUSE_TASK_STATUS_LIST = [
  "new",
  "received",
  "sent",
  "cancelled",
] as const;
export type WarehouseTaskStatus = (typeof WAREHOUSE_TASK_STATUS_LIST)[number];

export const WAREHOUSE_TASK_STATUS_LABEL: Record<WarehouseTaskStatus, string> =
  {
    new: "Нове",
    received: "В роботі",
    sent: "Відправлено",
    cancelled: "Скасовано",
  };

export const WAREHOUSE_TASK_DELIVERY_LIST = [
  "post",
  "delivery",
  "ukrposhta",
  "pickup",
] as const;
export type WarehouseTaskDelivery =
  (typeof WAREHOUSE_TASK_DELIVERY_LIST)[number];

export const WAREHOUSE_TASK_DELIVERY_LABEL: Record<
  WarehouseTaskDelivery,
  string
> = {
  post: "Нова Пошта",
  delivery: "Доставка",
  ukrposhta: "Укрпошта",
  pickup: "Самовивіз",
};

const STATUS_SET = new Set<string>(WAREHOUSE_TASK_STATUS_LIST);
const DELIVERY_SET = new Set<string>(WAREHOUSE_TASK_DELIVERY_LIST);

/** Нормалізує сирий статус у allow-list або `""` (ігнорувати). */
export function normalizeTaskStatus(
  raw: string | undefined,
): WarehouseTaskStatus | "" {
  const v = (raw ?? "").trim();
  return STATUS_SET.has(v) ? (v as WarehouseTaskStatus) : "";
}

/** Нормалізує сирий спосіб доставки у allow-list або `""` (ігнорувати). */
export function normalizeTaskDelivery(
  raw: string | undefined,
): WarehouseTaskDelivery | "" {
  const v = (raw ?? "").trim();
  return DELIVERY_SET.has(v) ? (v as WarehouseTaskDelivery) : "";
}

export interface BuildWarehouseTasksWhereParams {
  /** null = усі (склад/адмін/власник); string = лише завдання цього менеджера. */
  managerUserId: string | null;
  /** Статус документа (нормалізується). */
  status?: string;
  /** Пошук по імені клієнта (contains, insensitive). */
  customerName?: string;
  /** Спосіб доставки (нормалізується). */
  deliveryMethod?: string;
  /**
   * true → показувати лише активні (ховати завершені `sent`/скасовані
   * `cancelled`). Діє тільки коли явний `status` не заданий. Так «Готово»
   * (перехід у `sent`) прибирає завдання зі списку за замовчуванням.
   */
  openOnly?: boolean;
}

export function buildWarehouseTasksWhere(
  params: BuildWarehouseTasksWhereParams,
): Prisma.WarehouseTaskWhereInput {
  const and: Prisma.WarehouseTaskWhereInput[] = [];

  // Завдання зникає одразу, щойно менеджер видаляє реалізацію «в себе»
  // (`markedForDeletion=true`) — не чекаючи фінального видалення адміном.
  // Якщо адмін відхилить/відновить видалення — завдання повертається.
  and.push({ sale: { markedForDeletion: false } });

  if (params.managerUserId !== null) {
    and.push({ managerUserId: params.managerUserId });
  }

  const status = normalizeTaskStatus(params.status);
  if (status) {
    and.push({ status });
  } else if (params.openOnly) {
    and.push({ status: { notIn: ["sent", "cancelled"] } });
  }

  const delivery = normalizeTaskDelivery(params.deliveryMethod);
  if (delivery) and.push({ deliveryMethod: delivery });

  const name = (params.customerName ?? "").trim();
  if (name) {
    and.push({ customerName: { contains: name, mode: "insensitive" } });
  }

  return and.length > 0 ? { AND: and } : {};
}

// ─── Сортування ─────────────────────────────────────────────────────────────

export const WAREHOUSE_TASK_SORT_KEYS = [
  "customerName",
  "status",
  "createdAt",
] as const;
export type WarehouseTaskSortKey = (typeof WAREHOUSE_TASK_SORT_KEYS)[number];

const SORT_SET = new Set<string>(WAREHOUSE_TASK_SORT_KEYS);

/** Дефолтне сортування: статус ↑, потім свіжіші зверху. */
export const DEFAULT_WAREHOUSE_TASK_ORDER_BY: Prisma.WarehouseTaskOrderByWithRelationInput[] =
  [{ status: "asc" }, { createdAt: "desc" }];

/**
 * Будує `orderBy` зі свідомого allow-list-у ключів. Невідомий ключ → дефолт.
 * Напрямок: явний `asc`/`dir` перемагає; інакше дата — `desc`, решта — `asc`.
 */
export function buildWarehouseTasksOrderBy(
  sort: string | undefined,
  dir: string | undefined,
): Prisma.WarehouseTaskOrderByWithRelationInput[] {
  const key = (sort ?? "").trim();
  if (!SORT_SET.has(key)) return DEFAULT_WAREHOUSE_TASK_ORDER_BY;

  const direction: "asc" | "desc" =
    dir === "asc"
      ? "asc"
      : dir === "desc"
        ? "desc"
        : key === "createdAt"
          ? "desc"
          : "asc";

  if (key === "createdAt") return [{ createdAt: direction }];
  return [
    { [key]: direction } as Prisma.WarehouseTaskOrderByWithRelationInput,
    { createdAt: "desc" },
  ];
}
