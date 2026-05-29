/**
 * M3.4 (Closures) shapes — окремий файл щоб не конфліктувати з паралельними
 * сесіями що змінюють `soap/types.ts`. Імпортувати з `routes/closures.ts` і
 * (за потреби) з real-SOAP клієнта.
 */

/** Один рядок незакритого замовлення з 1С (Реєстр ЗаказыПокупателей.Остатки). */
export interface ClosureItem {
  orderUid: string;
  orderNumber: string;
  /** ISO 8601 строка (або порожня, якщо 1С не зміг серіалізувати). */
  orderDate: string;
  productUid: string;
  productName: string;
  quantity: number;
  sum: number;
  /** Скільки фактично продано по позиції з моменту замовлення. */
  sold: number;
  status: string;
}

export interface ClosuresGetRequest {
  /** READ-операція — idempotencyKey формальний (cache коректно дає 200). */
  idempotencyKey: string;
  /** `MgrClient.code1C` / `Customer.code1C` (НЕ UUID — 1С резолвить за Кодом). */
  clientCode1C: string;
}

export interface ClosuresGetSuccess {
  ok: true;
  items: ClosureItem[];
  mockMode?: boolean;
}

export interface ClosuresGetError {
  ok: false;
  errorCode: number;
  errorMessage: string;
  mockMode?: boolean;
}

export type ClosuresGetResult = ClosuresGetSuccess | ClosuresGetError;

export interface ClosuresCloseItem {
  orderUid: string;
  productUid: string;
  quantity: number;
  price: number;
  /** Якщо true — 1С створює нове замовлення з цими позиціями (auto-flow з v1). */
  addToNewOrder: boolean;
}

export interface ClosuresCloseRequest {
  idempotencyKey: string;
  clientCode1C: string;
  items: ClosuresCloseItem[];
}

export interface ClosuresCloseSuccess {
  ok: true;
  /** Кількість закритих рядків (на сьогодні = `items.length`). */
  closedCount: number;
  /** UID нового `Документ.Заказ` (якщо `addToNewOrder=true` принаймні в одному item). */
  newOrderUid: string | null;
  /** Номер нового документа (для read-back / лінків). */
  newOrderNumber: string | null;
  /** True коли idempotencyKey уже використовувався раніше (дубль). */
  alreadyProcessed: boolean;
  mockMode?: boolean;
}

export interface ClosuresCloseError {
  ok: false;
  errorCode: number;
  errorMessage: string;
  mockMode?: boolean;
}

export type ClosuresCloseResult = ClosuresCloseSuccess | ClosuresCloseError;
