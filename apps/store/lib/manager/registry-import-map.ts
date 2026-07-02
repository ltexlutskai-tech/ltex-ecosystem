/**
 * Чисті мапери рядків регістрів-оборотів 1С → записи наших таблиць
 * (`SalesMovement`, `CashFlowMovement`, `StockMovement`, `OrderRemainderMovement`).
 *
 * Винесено окремо від `scripts/import-1c-historical.ts` для юніт-тестів: уся
 * логіка знаку/розрахунку — тут, скрипт лише читає 1С + резолвить FK + викликає
 * ці мапери. Дзеркалить патерн боргу (`MgrDebtMovement`).
 *
 * ⚠️ Точні фізичні коди колонок (`_FldNNNN`) звірені з docs/1c-mssql-schema/
 * columns.tsv + XML-метаданими AccumulationRegisters, але НЕ перевірені на
 * живому MSSQL у пісочниці. Якщо звірка кількостей розійдеться — уточнити
 * відповідності у скрипті (REG_*_COLS) і рерайт-нути імпорт.
 */

/** Округлення до 2 знаків (гроші). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Округлення до 3 знаків (кг/кількість). */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

// ─── Продажи (AccumRg Продажи) ──────────────────────────────────────────────

export interface SalesMovementInput {
  occurredAt: Date;
  recorderCode1C: string;
  lineNo: number;
  productCode1C: string | null;
  productId: string | null;
  lotCode1C: string | null;
  clientCode1C: string | null;
  clientId: string | null;
  agentCode1C: string | null;
  orderCode1C: string | null;
  saleCode1C: string | null;
  /** Количество (15,3). */
  qty: number;
  /** Вес-кг (15,3). */
  weightKg: number | null;
  /** Стоимость (15,2) — виручка EUR. */
  revenueEur: number;
  /** СтоимостьБезСкидок (15,2). */
  revenueNoDiscountEur: number | null;
  /** 0=прихід (звичайна реалізація), 1=розхід (повернення). */
  recordKind: number;
}

export interface SalesMovementRecord {
  occurredAt: Date;
  recorderCode1C: string;
  lineNo: number;
  productCode1C: string | null;
  productId: string | null;
  lotCode1C: string | null;
  clientCode1C: string | null;
  clientId: string | null;
  agentCode1C: string | null;
  orderCode1C: string | null;
  saleCode1C: string | null;
  qty: number;
  weightKg: number | null;
  revenueEur: number;
  revenueNoDiscountEur: number | null;
  costEur: null;
  recordKind: number;
}

export function buildSalesMovement(
  input: SalesMovementInput,
): SalesMovementRecord {
  return {
    occurredAt: input.occurredAt,
    recorderCode1C: input.recorderCode1C,
    lineNo: input.lineNo,
    productCode1C: input.productCode1C,
    productId: input.productId,
    lotCode1C: input.lotCode1C,
    clientCode1C: input.clientCode1C,
    clientId: input.clientId,
    agentCode1C: input.agentCode1C,
    orderCode1C: input.orderCode1C,
    saleCode1C: input.saleCode1C,
    qty: round3(input.qty),
    weightKg: input.weightKg == null ? null : round3(input.weightKg),
    revenueEur: round2(input.revenueEur),
    revenueNoDiscountEur:
      input.revenueNoDiscountEur == null
        ? null
        : round2(input.revenueNoDiscountEur),
    costEur: null,
    recordKind: input.recordKind === 1 ? 1 : 0,
  };
}

// ─── ДвиженияДенежныхСредств (ДДС) ──────────────────────────────────────────

export interface CashFlowMovementInput {
  occurredAt: Date;
  recorderCode1C: string;
  lineNo: number;
  accountCode1C: string | null;
  articleCode1C: string | null;
  /** ПриходРасход: 0=прихід / 1=розхід. */
  direction: number;
  clientCode1C: string | null;
  /** Сумма (у валюті рахунку/каси). */
  amountUah: number;
  /** СуммаУпр (EUR, управл. облік). */
  amountUpr: number | null;
  /** Валюта рахунку/каси: "UAH" | "EUR" | "USD" (null = невідомо → UAH у звіті). */
  currencyCode?: string | null;
}

export interface CashFlowMovementRecord {
  occurredAt: Date;
  recorderCode1C: string;
  lineNo: number;
  accountCode1C: string | null;
  articleCode1C: string | null;
  direction: number;
  clientCode1C: string | null;
  amountUah: number;
  amountUpr: number | null;
  currencyCode: string | null;
}

export function buildCashFlowMovement(
  input: CashFlowMovementInput,
): CashFlowMovementRecord {
  return {
    occurredAt: input.occurredAt,
    recorderCode1C: input.recorderCode1C,
    lineNo: input.lineNo,
    accountCode1C: input.accountCode1C,
    articleCode1C: input.articleCode1C,
    direction: input.direction === 1 ? 1 : 0,
    clientCode1C: input.clientCode1C,
    amountUah: round2(input.amountUah),
    amountUpr: input.amountUpr == null ? null : round2(input.amountUpr),
    currencyCode: input.currencyCode ?? null,
  };
}

// ─── ТоварыНаСкладах (+ вага) ───────────────────────────────────────────────

export interface StockMovementInput {
  occurredAt: Date;
  recorderCode1C: string;
  lineNo: number;
  warehouseCode1C: string | null;
  productCode1C: string;
  productId: string | null;
  lotCode1C: string | null;
  quality: string | null;
  /** Количество (шт). */
  qty: number;
  /** кг (з регістру у вазі). */
  weightKg: number | null;
  /** 0=прихід / 1=розхід. */
  recordKind: number;
}

export interface StockMovementRecord {
  occurredAt: Date;
  recorderCode1C: string;
  lineNo: number;
  warehouseCode1C: string | null;
  productCode1C: string;
  productId: string | null;
  lotCode1C: string | null;
  quality: string | null;
  qty: number;
  weightKg: number | null;
  recordKind: number;
}

export function buildStockMovement(
  input: StockMovementInput,
): StockMovementRecord {
  return {
    occurredAt: input.occurredAt,
    recorderCode1C: input.recorderCode1C,
    lineNo: input.lineNo,
    warehouseCode1C: input.warehouseCode1C,
    productCode1C: input.productCode1C,
    productId: input.productId,
    lotCode1C: input.lotCode1C,
    quality: input.quality,
    qty: round3(input.qty),
    weightKg: input.weightKg == null ? null : round3(input.weightKg),
    recordKind: input.recordKind === 1 ? 1 : 0,
  };
}

// ─── ЗаказыПокупателей (залишки замовлень) ──────────────────────────────────

export interface OrderRemainderMovementInput {
  occurredAt: Date;
  recorderCode1C: string;
  lineNo: number;
  orderCode1C: string;
  orderId: string | null;
  productCode1C: string | null;
  productId: string | null;
  qty: number;
  recordKind: number;
}

export interface OrderRemainderMovementRecord {
  occurredAt: Date;
  recorderCode1C: string;
  lineNo: number;
  orderCode1C: string;
  orderId: string | null;
  productCode1C: string | null;
  productId: string | null;
  qty: number;
  recordKind: number;
}

export function buildOrderRemainderMovement(
  input: OrderRemainderMovementInput,
): OrderRemainderMovementRecord {
  return {
    occurredAt: input.occurredAt,
    recorderCode1C: input.recorderCode1C,
    lineNo: input.lineNo,
    orderCode1C: input.orderCode1C,
    orderId: input.orderId,
    productCode1C: input.productCode1C,
    productId: input.productId,
    qty: round3(input.qty),
    recordKind: input.recordKind === 1 ? 1 : 0,
  };
}
