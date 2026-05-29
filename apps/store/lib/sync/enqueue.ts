import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@ltex/db";
import type { ClientUpdatePayload } from "@/lib/validations/sync-job";

/**
 * Збирає payload для 1С `ОбновитиКлієнтаJSON` з MgrClient row + relations
 * і створює row у `mgr_sync_jobs` черзі.
 *
 * Cron-worker (`/api/cron/process-sync-queue`) поступово дренує чергу.
 *
 * Decimal-поля передаються як string з `.` decimal separator щоб уникнути
 * floating-point round-trip issues. Empty-string optional поля нормалізуються
 * у null.
 *
 * **DO NOT** робити цей call синхронно у HTTP-handler-i; завжди обертай
 * у try/catch і не fail-и сам PATCH якщо enqueue впав (sync — best-effort).
 *
 * ─── Розбіжності з BSL (Етап 2.5 align, TODO для наступного раунду) ──────
 *
 * Поля payload-ів, які BSL у `docs/1c-bsl/outbound/Module.bsl.append`
 * **ігнорує** (не присвоює у реквізити документа/довідника):
 *
 *   • Client:
 *       — `primaryAssortmentCode` — у BSL TODO (немає очевидного 1С-довідника).
 *
 *   • Order:
 *       — `status` (наш draft/sent/posted) — у BSL немає mapping.
 *       — `totalUah` — BSL пише лише `СуммаДокумента` з `totalEur`.
 *       — `code1C` (повторно) — BSL не оновлює існуючі замовлення, лише створює.
 *       — `items[].productId` / `items[].lotId` (наші внутрішні UUID) — ігнорується;
 *         BSL використовує тільки `productCode1C` / `lotBarcode`.
 *
 *   • Payment:
 *       — `currency` (наш "UAH"/"EUR") — BSL пише завжди в УГА (валюта документа).
 *       — `orderInternalId` (наш UUID) — BSL знаходить замовлення за `orderCode1C`.
 *
 *   • CashOrder (НАЙБІЛЬШЕ розбіжностей — BSL покриває лише ПКО UAH):
 *       — `amountEur`, `amountUsd`, `amountUahCashless` — ігнорується;
 *         multi-currency сценарій (3 ордери + безнал) — TODO BSL (README §5.2).
 *       — `debtCorrection`, `correctionUid` — корекція боргу не реалізована.
 *       — `uidUah`, `uidEur`, `uidUsd` — мультивалютні UUID-ключі не використовуються.
 *       — `docNumber`, `code1C` — BSL не оновлює існуючі касові ордери.
 *
 *   • Sale (Realization):
 *       — `customerName` — BSL читає з resolved посилання на Контрагента.
 *       — `priceTypeId` (наш UUID) — BSL потребує `code` довідника; treba замінити
 *         на `priceTypeCode` як у Client.
 *       — `assignedAgentUserId` (наш Next-user UUID) — НЕ резолвиться у Catalog.
 *         ТорговыйАгент; треба передавати `assignedAgentCode1C`.
 *       — `onTradeAgent` (bool) — у BSL немає mapping.
 *       — `docNumber`, `code1C` — BSL не оновлює існуючі реалізації.
 *       — `items[].productId`/`items[].lotId` — ігнорується (як в Order).
 *
 *   • RouteSheet:
 *       — `payments[]` — ігнорується; 1С відновлює оплати з пов'язаних ПКО/РКО
 *         (аудит §H, дискримінатор `ТабЧасть`).
 *       — `date`, `code1C`, `docNumber` — BSL виставляє `Дата = ТекущаяДата()`.
 *       — `items[].unit`, `loading[].unit` — BSL не використовує (одиниці резолвить
 *         з номенклатури).
 *
 * Жодна розбіжність НЕ блокує fire-and-forget enqueue — BSL обертає кожне
 * присвоєння у `Попытка...Исключение КонецПопытки` і просто пропускає невідомий
 * реквізит. Усе вище — питання повноти даних на стороні 1С, а не runtime-помилка.
 *
 * ─── Rework під Molenari OU (Етап 2 переробка) ────────────────────────────
 *
 *   • Postachalnyk `Molenari OU` блокує нові кореневі об'єкти конфігурації
 *     (`Catalog.СинкЛог`, `Constant.СинкСистемнийПароль`, `CommonModule.СинкВхідний`,
 *     `ScheduledJob.ЧисткаСинкЛогу`). Тому:
 *   • Idempotency повністю на Node-стороні — `queue-processor.ts` фільтрує
 *     `status IN ('pending','retrying')` (sent/failed НЕ ретраяться). На
 *     1С-стороні `alreadyProcessed` завжди = false; повторний виклик з
 *     ідентичним idempotencyKey СТВОРИТЬ другий документ-чернетку (рідкісне race).
 *   • `password` тепер передається з `services/manager-sync/.env::ONEC_SOAP_PASSWORD`
 *     і інжектиться у JSONДані (`buildSoapEnvelope` додає поле `password`).
 *     Зовнішній SOAP-параметр `<ms:ПарольВхода>` лишається порожнім; auth
 *     перевіряється у BSL `_LTEX_ПеревіритиПароль` через hardcoded string
 *     порівняння з `LTEX_SYNC_PASSWORD_PLACEHOLDER` (заміняється вручну при
 *     вставці у Конфігуратор). Деталі — `docs/1c-bsl/outbound/README.md` §3.
 */

export interface ClientForEnqueue {
  id: string;
  code1C: string | null;
  name: string;
  tradePointName: string | null;
  region: string | null;
  city: string | null;
  street: string | null;
  house: string | null;
  novaPoshtaBranch: string | null;
  websiteUrl: string | null;
  geolocation: string | null;
  monthlyVolume: { toString(): string } | null;
  licenseExpiresAt: Date | null;
  viberContact: string | null;
  dialogStatus: string | null;
  statusGeneral: { code: string } | null;
  statusOperational: { code: string } | null;
  categoryTT: { code: string } | null;
  deliveryMethod: { code: string } | null;
  searchChannel: { code: string } | null;
  primaryRoute: { code1C: string | null } | null;
  primaryAssortment: { code: string } | null;
  priceType: { code: string } | null;
  agent: { code1C: string | null } | null;
}

export function buildClientUpdatePayload(
  client: ClientForEnqueue,
): ClientUpdatePayload {
  return {
    code1C: client.code1C,
    name: client.name,
    tradePointName: emptyToNull(client.tradePointName),
    region: emptyToNull(client.region),
    city: emptyToNull(client.city),
    street: emptyToNull(client.street),
    house: emptyToNull(client.house),
    novaPoshtaBranch: emptyToNull(client.novaPoshtaBranch),
    websiteUrl: emptyToNull(client.websiteUrl),
    geolocation: emptyToNull(client.geolocation),
    monthlyVolume: client.monthlyVolume
      ? client.monthlyVolume.toString()
      : null,
    licenseExpiresAt: client.licenseExpiresAt
      ? client.licenseExpiresAt.toISOString()
      : null,
    viberContact: emptyToNull(client.viberContact),
    dialogStatus: emptyToNull(client.dialogStatus),
    statusGeneralCode: client.statusGeneral?.code ?? null,
    statusOperationalCode: client.statusOperational?.code ?? null,
    categoryTTCode: client.categoryTT?.code ?? null,
    deliveryMethodCode: client.deliveryMethod?.code ?? null,
    searchChannelCode: client.searchChannel?.code ?? null,
    primaryRouteCode: client.primaryRoute?.code1C ?? null,
    primaryAssortmentCode: client.primaryAssortment?.code ?? null,
    priceTypeCode: client.priceType?.code ?? null,
    agentCode1C: client.agent?.code1C ?? null,
  };
}

function emptyToNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return v === "" ? null : v;
}

export async function enqueueClientUpdate(
  client: ClientForEnqueue,
  action: "update" | "create" = "update",
) {
  const payload = buildClientUpdatePayload(client);
  return prisma.mgrSyncJob.create({
    data: {
      entityType: "client",
      entityId: client.id,
      action,
      payload,
      idempotencyKey: randomUUID(),
      nextAttemptAt: new Date(),
    },
  });
}

// ─── M1.5b — Order + Payment enqueue ────────────────────────────────────────

/**
 * Shape для `enqueueOrderCreate` — мінімум полів з Order + items для
 * payload-у `СтворитиЗамовленняJSON` SOAP-operation (див. docs/1C_SYNC_MODULES_SPEC.md §3.2
 * + `docs/1c-bsl/outbound/Module.bsl.append`).
 *
 * Усі numeric поля передаються як string з `.` decimal separator щоб уникнути
 * floating-point issues (1С парсить через Число()).
 */
export interface OrderForEnqueue {
  id: string;
  code1C: string | null;
  status: string;
  totalEur: number;
  totalUah: number;
  exchangeRate: number;
  notes: string | null;
  customer: { code1C: string | null };
  items: Array<{
    productId: string;
    lotId: string | null;
    priceEur: number;
    weight: number;
    quantity: number;
    product?: { code1C: string | null } | null;
    lot?: { barcode: string } | null;
  }>;
}

export interface OrderCreatePayload {
  orderInternalId: string;
  code1C: string | null;
  status: string;
  customerCode1C: string | null;
  notes: string | null;
  totalEur: string;
  totalUah: string;
  exchangeRate: string;
  items: Array<{
    productId: string;
    productCode1C: string | null;
    lotId: string | null;
    lotBarcode: string | null;
    priceEur: string;
    weight: string;
    quantity: number;
  }>;
}

export function buildOrderCreatePayload(
  order: OrderForEnqueue,
): OrderCreatePayload {
  return {
    orderInternalId: order.id,
    code1C: order.code1C,
    status: order.status,
    customerCode1C: order.customer.code1C,
    notes: emptyToNull(order.notes),
    totalEur: order.totalEur.toFixed(2),
    totalUah: order.totalUah.toFixed(2),
    exchangeRate: order.exchangeRate.toFixed(4),
    items: order.items.map((item) => ({
      productId: item.productId,
      productCode1C: item.product?.code1C ?? null,
      lotId: item.lotId,
      lotBarcode: item.lot?.barcode ?? null,
      priceEur: item.priceEur.toFixed(2),
      weight: item.weight.toFixed(3),
      quantity: item.quantity,
    })),
  };
}

export async function enqueueOrderCreate(order: OrderForEnqueue) {
  const payload = buildOrderCreatePayload(order);
  return prisma.mgrSyncJob.create({
    data: {
      entityType: "order",
      entityId: order.id,
      action: "create",
      payload: payload as unknown as Prisma.InputJsonValue,
      idempotencyKey: randomUUID(),
      nextAttemptAt: new Date(),
    },
  });
}

/**
 * Shape для `enqueuePaymentCreate` — мінімум полів з Payment + parent
 * order.code1C для payload-у `СтворитиОплатуJSON`.
 */
export interface PaymentForEnqueue {
  id: string;
  orderId: string;
  method: string;
  amount: number;
  currency: string;
  externalId: string | null;
  paidAt: Date | null;
  order?: { code1C: string | null } | null;
}

export interface PaymentCreatePayload {
  paymentInternalId: string;
  orderInternalId: string;
  orderCode1C: string | null;
  method: string;
  amount: string;
  currency: string;
  externalId: string | null;
  paidAt: string | null;
}

export function buildPaymentCreatePayload(
  payment: PaymentForEnqueue,
): PaymentCreatePayload {
  return {
    paymentInternalId: payment.id,
    orderInternalId: payment.orderId,
    orderCode1C: payment.order?.code1C ?? null,
    method: payment.method,
    amount: payment.amount.toFixed(2),
    currency: payment.currency,
    externalId: emptyToNull(payment.externalId),
    paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
  };
}

export async function enqueuePaymentCreate(payment: PaymentForEnqueue) {
  const payload = buildPaymentCreatePayload(payment);
  return prisma.mgrSyncJob.create({
    data: {
      entityType: "payment",
      entityId: payment.id,
      action: "create",
      payload: payload as unknown as Prisma.InputJsonValue,
      idempotencyKey: randomUUID(),
      nextAttemptAt: new Date(),
    },
  });
}

// ─── M1.6 (Реалізація, Етап 5) — Sale enqueue ───────────────────────────────

/**
 * Shape для `enqueueSaleCreate` — мінімум полів з Sale + items для payload-у
 * `СтворитиРеалізаціюJSON` SOAP-operation (див. docs/1C_SYNC_MODULES_SPEC.md §3.4
 * + `docs/1c-bsl/outbound/Module.bsl.append`).
 *
 * Mirror-ить `OrderForEnqueue`, але реалізація несе додаткові менеджерські
 * поля (курс EUR+USD, наложка/сума COD, призначений агент, ТТН) і кожен рядок
 * має `pricePerKg` (ЦенаПродажиВес). Усі numeric поля передаються як string з
 * `.` decimal separator щоб уникнути floating-point issues (1С парсить через
 * Число()).
 */
export interface SaleForEnqueue {
  id: string;
  code1C: string | null;
  docNumber: number;
  totalEur: number;
  totalUah: number;
  exchangeRateEur: number;
  exchangeRateUsd: number;
  priceTypeId: string | null;
  deliveryMethod: string | null;
  novaPoshtaBranch: string | null;
  cashOnDelivery: boolean;
  codAmountUah: number | null;
  assignedAgentUserId: string | null;
  onTradeAgent: boolean;
  expressWaybill: string | null;
  notes: string | null;
  customer: { code1C: string | null; name: string };
  items: Array<{
    productId: string;
    lotId: string | null;
    pricePerKg: number;
    weight: number;
    quantity: number;
    priceEur: number;
    product?: { code1C: string | null } | null;
    lot?: { barcode: string } | null;
  }>;
}

export interface SaleCreatePayload {
  saleInternalId: string;
  code1C: string | null;
  docNumber: number;
  customerCode1C: string | null;
  customerName: string;
  notes: string | null;
  totalEur: string;
  totalUah: string;
  exchangeRateEur: string;
  exchangeRateUsd: string;
  priceTypeId: string | null;
  deliveryMethod: string | null;
  novaPoshtaBranch: string | null;
  cashOnDelivery: boolean;
  codAmountUah: string | null;
  assignedAgentUserId: string | null;
  onTradeAgent: boolean;
  expressWaybill: string | null;
  items: Array<{
    productId: string;
    productCode1C: string | null;
    lotId: string | null;
    lotBarcode: string | null;
    pricePerKg: string;
    priceEur: string;
    weight: string;
    quantity: number;
  }>;
}

export function buildSaleCreatePayload(
  sale: SaleForEnqueue,
): SaleCreatePayload {
  return {
    saleInternalId: sale.id,
    code1C: sale.code1C,
    docNumber: sale.docNumber,
    customerCode1C: sale.customer.code1C,
    customerName: sale.customer.name,
    notes: emptyToNull(sale.notes),
    totalEur: sale.totalEur.toFixed(2),
    totalUah: sale.totalUah.toFixed(2),
    exchangeRateEur: sale.exchangeRateEur.toFixed(4),
    exchangeRateUsd: sale.exchangeRateUsd.toFixed(4),
    priceTypeId: emptyToNull(sale.priceTypeId),
    deliveryMethod: emptyToNull(sale.deliveryMethod),
    novaPoshtaBranch: emptyToNull(sale.novaPoshtaBranch),
    cashOnDelivery: sale.cashOnDelivery,
    codAmountUah:
      sale.codAmountUah !== null ? sale.codAmountUah.toFixed(2) : null,
    assignedAgentUserId: emptyToNull(sale.assignedAgentUserId),
    onTradeAgent: sale.onTradeAgent,
    expressWaybill: emptyToNull(sale.expressWaybill),
    items: sale.items.map((item) => ({
      productId: item.productId,
      productCode1C: item.product?.code1C ?? null,
      lotId: item.lotId,
      lotBarcode: item.lot?.barcode ?? null,
      pricePerKg: item.pricePerKg.toFixed(2),
      priceEur: item.priceEur.toFixed(2),
      weight: item.weight.toFixed(3),
      quantity: item.quantity,
    })),
  };
}

export async function enqueueSaleCreate(sale: SaleForEnqueue) {
  const payload = buildSaleCreatePayload(sale);
  return prisma.mgrSyncJob.create({
    data: {
      entityType: "realization",
      entityId: sale.id,
      action: "create",
      payload: payload as unknown as Prisma.InputJsonValue,
      idempotencyKey: randomUUID(),
      nextAttemptAt: new Date(),
    },
  });
}

/**
 * Shape для `enqueueCashOrderCreate` — мінімум полів з MgrCashOrder + relations
 * для payload-у `СтворитиКасовийОрдерJSON` SOAP-operation (див. docs/1C_SYNC_MODULES_SPEC.md
 * §3.5 + `docs/1c-bsl/outbound/Module.bsl.append`). Один мобільний касовий
 * ордер → до 3 ПКО/РКО у central 1С (по одному на валюту з ненульовою сумою)
 * + безнал як платіжне доручення (контракт §H аудиту).
 * ⚠ BSL поки реалізує ЛИШЕ сценарій ПКО UAH (README §5.2 outbound); решта валют
 * + безнал + здача — TODO для наступного раунду.
 *
 * Усі numeric поля передаються як string з `.` decimal separator (1С парсить
 * через Число()). Курси — 4 знаки. `customer`/`sale` несуть code1C як 1С-ключі;
 * `bankAccountRef`/`cashFlowArticleRef` — code1C довідників. Мультивалютні
 * UUID-ключі (`uidUah`/`uidEur`/`uidUsd`) — `УИДГРН`/`ПКО_УИД`/`УИДUSD`.
 */
export interface CashOrderForEnqueue {
  id: string;
  code1C: string | null;
  docNumber: number;
  type: string; // income | expense (Приход/Расход)
  amountUah: number;
  amountEur: number;
  amountUsd: number;
  amountUahCashless: number;
  rateEur: number;
  rateUsd: number;
  documentSumEur: number;
  debtCorrection: number;
  correctionUid: string | null;
  changeForId: string | null;
  uidUah: string | null;
  uidEur: string | null;
  uidUsd: string | null;
  customer: { code1C: string | null } | null;
  sale: { code1C: string | null } | null;
  bankAccountRef: { code1C: string | null } | null;
  cashFlowArticleRef: { code1C: string | null } | null;
}

export interface CashOrderCreatePayload {
  cashOrderInternalId: string;
  code1C: string | null;
  docNumber: number;
  /** Приход/Расход (ВидДвижения). */
  type: string;
  customerCode1C: string | null;
  saleCode1C: string | null;
  amountUah: string;
  amountEur: string;
  amountUsd: string;
  amountUahCashless: string;
  rateEur: string;
  rateUsd: string;
  documentSumEur: string;
  debtCorrection: string;
  correctionUid: string | null;
  bankAccountCode1C: string | null;
  cashFlowArticleCode1C: string | null;
  /** Прапор `Сдача` (1С) — ордер є здачею до прихідного. */
  isChange: boolean;
  /** Мультивалютні бізнес-ключі обміну (УИДГРН / ПКО_УИД / УИДUSD). */
  uidUah: string;
  uidEur: string;
  uidUsd: string;
}

export function buildCashOrderCreatePayload(
  order: CashOrderForEnqueue,
): CashOrderCreatePayload {
  return {
    cashOrderInternalId: order.id,
    code1C: order.code1C,
    docNumber: order.docNumber,
    type: order.type,
    customerCode1C: order.customer?.code1C ?? null,
    saleCode1C: order.sale?.code1C ?? null,
    amountUah: order.amountUah.toFixed(2),
    amountEur: order.amountEur.toFixed(2),
    amountUsd: order.amountUsd.toFixed(2),
    amountUahCashless: order.amountUahCashless.toFixed(2),
    rateEur: order.rateEur.toFixed(4),
    rateUsd: order.rateUsd.toFixed(4),
    documentSumEur: order.documentSumEur.toFixed(2),
    debtCorrection: order.debtCorrection.toFixed(2),
    correctionUid: emptyToNull(order.correctionUid),
    bankAccountCode1C: order.bankAccountRef?.code1C ?? null,
    cashFlowArticleCode1C: order.cashFlowArticleRef?.code1C ?? null,
    isChange: order.changeForId != null,
    // Мультивалютні UUID-ключі: беремо збережені на ордері, інакше генеруємо для
    // payload-у (scaffold-спрощення — у фінальній версії ключі персистяться на
    // MgrCashOrder при створенні через ПередЗаписью-аналог; див. §3.5 спеки).
    uidUah: emptyToNull(order.uidUah) ?? randomUUID(),
    uidEur: emptyToNull(order.uidEur) ?? randomUUID(),
    uidUsd: emptyToNull(order.uidUsd) ?? randomUUID(),
  };
}

export async function enqueueCashOrderCreate(order: CashOrderForEnqueue) {
  const payload = buildCashOrderCreatePayload(order);
  return prisma.mgrSyncJob.create({
    data: {
      entityType: "cash_order",
      entityId: order.id,
      action: "create",
      payload: payload as unknown as Prisma.InputJsonValue,
      idempotencyKey: randomUUID(),
      nextAttemptAt: new Date(),
    },
  });
}

// ─── M1.9 (Маршрутний лист, Етап 5) — Route sheet enqueue ───────────────────

/**
 * Збирає payload для 1С `СтворитиМаршрутнийЛистJSON` (двофазний контракт,
 * `docs/1C_SYNC_MODULES_SPEC.md` §3.6 + `docs/1c-bsl/outbound/Module.bsl.append`)
 * і ставить row у `mgr_sync_jobs` чергу.
 *
 * Маршрутний лист — документ-агрегатор дня виїзду: він не несе власних товарних
 * полів, а **оркеструє** дочірні таб. частини (`Заказы`/`ТоварыЗаказов`/
 * `ЗагрузкаМашины`/`Завдання`) + похідні документи (`Реализации`/`Оплаты`),
 * що приходять окремими ключами (аудит §H, дискримінатор `ТабЧасть` + верхній
 * ключ `Реализации`; Оплати 1С відновлює на сервері з пов'язаних ПКО/РКО).
 *
 * Через це enqueue читає весь граф з БД (batch-резолв code1C/штрихкодів через
 * Prisma): шапку, рядки `RouteSheetOrder`/`RouteSheetItem`/`RouteSheetLoading`/
 * `RouteSheetTask` + похідні `Sale where routeSheetId==id` (Реалізації) і
 * `MgrCashOrder where routeSheetId==id` (Оплати).
 *
 * Усі numeric поля передаються як string з `.` decimal separator щоб уникнути
 * floating-point issues (1С парсить через Число()).
 *
 * **DO NOT** робити цей call синхронно у HTTP-handler-i; завжди обертай
 * у `void enqueueRouteSheetCreate(id).catch(warn)` (sync — best-effort).
 */

export interface RouteSheetCreatePayload {
  routeSheetInternalId: string;
  code1C: string | null;
  docNumber: number;
  date: string;
  arrivalDate: string | null;
  status: string;
  routeCode1C: string | null;
  expeditorCode1C: string | null;
  comment: string | null;
  mileageStartKm: string | null;
  mileageEndKm: string | null;
  gpsLat: string | null;
  gpsLng: string | null;
  orders: Array<{
    orderCode1C: string | null;
    customerCode1C: string | null;
    city: string | null;
  }>;
  items: Array<{
    orderCode1C: string | null;
    customerCode1C: string | null;
    productCode1C: string | null;
    lotBarcode: string | null;
    unit: string | null;
    quantity: number;
    quantityLoaded: number;
    price: string;
    sum: string;
  }>;
  loading: Array<{
    orderCode1C: string | null;
    customerCode1C: string | null;
    productCode1C: string | null;
    lotBarcode: string | null;
    unit: string | null;
    quantity: number;
    weight: string;
    price: string;
    sum: string;
    pricePerKg: string;
    loaded: boolean;
    isReturn: boolean;
  }>;
  sales: Array<{
    saleCode1C: string | null;
    orderCode1C: string | null;
    customerCode1C: string | null;
    sum: string;
  }>;
  payments: Array<{
    cashOrderCode1C: string | null;
    saleCode1C: string | null;
    customerCode1C: string | null;
    type: string;
    amount: string;
  }>;
  tasks: Array<{
    customerCode1C: string | null;
    comment: string;
  }>;
}

/**
 * Будує payload із зчитаних рядків графа МЛ. Чиста функція (без I/O) —
 * `enqueueRouteSheetCreate` спершу batch-резолвить code1C/штрихкоди, потім
 * передає сюди готові рядки з уже резолвленими бізнес-ключами.
 */
export function buildRouteSheetCreatePayload(input: {
  sheet: {
    id: string;
    code1C: string | null;
    docNumber: number;
    date: Date;
    arrivalDate: Date | null;
    status: string;
    comment: string | null;
    mileageStartKm: number | null;
    mileageEndKm: number | null;
    gpsLat: number | null;
    gpsLng: number | null;
  };
  routeCode1C: string | null;
  expeditorCode1C: string | null;
  orders: Array<{
    orderCode1C: string | null;
    customerCode1C: string | null;
    city: string | null;
  }>;
  items: Array<{
    orderCode1C: string | null;
    customerCode1C: string | null;
    productCode1C: string | null;
    lotBarcode: string | null;
    unit: string | null;
    quantity: number;
    quantityLoaded: number;
    price: number;
    sum: number;
  }>;
  loading: Array<{
    orderCode1C: string | null;
    customerCode1C: string | null;
    productCode1C: string | null;
    lotBarcode: string | null;
    unit: string | null;
    quantity: number;
    weight: number;
    price: number;
    sum: number;
    pricePerKg: number;
    loaded: boolean;
    isReturn: boolean;
  }>;
  sales: Array<{
    saleCode1C: string | null;
    orderCode1C: string | null;
    customerCode1C: string | null;
    sum: number;
  }>;
  payments: Array<{
    cashOrderCode1C: string | null;
    saleCode1C: string | null;
    customerCode1C: string | null;
    type: string;
    amount: number;
  }>;
  tasks: Array<{ customerCode1C: string | null; comment: string }>;
}): RouteSheetCreatePayload {
  const { sheet } = input;
  return {
    routeSheetInternalId: sheet.id,
    code1C: sheet.code1C,
    docNumber: sheet.docNumber,
    date: sheet.date.toISOString(),
    arrivalDate: sheet.arrivalDate ? sheet.arrivalDate.toISOString() : null,
    status: sheet.status,
    routeCode1C: input.routeCode1C,
    expeditorCode1C: input.expeditorCode1C,
    comment: emptyToNull(sheet.comment),
    mileageStartKm:
      sheet.mileageStartKm !== null ? sheet.mileageStartKm.toFixed(1) : null,
    mileageEndKm:
      sheet.mileageEndKm !== null ? sheet.mileageEndKm.toFixed(1) : null,
    gpsLat: sheet.gpsLat !== null ? sheet.gpsLat.toFixed(6) : null,
    gpsLng: sheet.gpsLng !== null ? sheet.gpsLng.toFixed(6) : null,
    orders: input.orders.map((o) => ({
      orderCode1C: o.orderCode1C,
      customerCode1C: o.customerCode1C,
      city: emptyToNull(o.city),
    })),
    items: input.items.map((it) => ({
      orderCode1C: it.orderCode1C,
      customerCode1C: it.customerCode1C,
      productCode1C: it.productCode1C,
      lotBarcode: it.lotBarcode,
      unit: emptyToNull(it.unit),
      quantity: it.quantity,
      quantityLoaded: it.quantityLoaded,
      price: it.price.toFixed(2),
      sum: it.sum.toFixed(2),
    })),
    loading: input.loading.map((ld) => ({
      orderCode1C: ld.orderCode1C,
      customerCode1C: ld.customerCode1C,
      productCode1C: ld.productCode1C,
      lotBarcode: ld.lotBarcode,
      unit: emptyToNull(ld.unit),
      quantity: ld.quantity,
      weight: ld.weight.toFixed(3),
      price: ld.price.toFixed(2),
      sum: ld.sum.toFixed(2),
      pricePerKg: ld.pricePerKg.toFixed(2),
      loaded: ld.loaded,
      isReturn: ld.isReturn,
    })),
    sales: input.sales.map((s) => ({
      saleCode1C: s.saleCode1C,
      orderCode1C: s.orderCode1C,
      customerCode1C: s.customerCode1C,
      sum: s.sum.toFixed(2),
    })),
    payments: input.payments.map((p) => ({
      cashOrderCode1C: p.cashOrderCode1C,
      saleCode1C: p.saleCode1C,
      customerCode1C: p.customerCode1C,
      type: p.type,
      amount: p.amount.toFixed(2),
    })),
    tasks: input.tasks.map((t) => ({
      customerCode1C: t.customerCode1C,
      comment: t.comment,
    })),
  };
}

/**
 * Читає весь граф МЛ з БД + batch-резолвить бізнес-ключі (code1C маршруту/
 * експедитора/замовлень/клієнтів/товарів + штрихкоди лотів) і ставить row
 * у чергу `mgr_sync_jobs` (entityType `route_sheet`).
 *
 * Якщо МЛ не знайдено — no-op (повертає `null`); виклик завжди best-effort.
 */
export async function enqueueRouteSheetCreate(routeSheetId: string) {
  const sheet = await prisma.routeSheet.findUnique({
    where: { id: routeSheetId },
    include: {
      route: { select: { code1C: true } },
      expeditor: { select: { code1C: true } },
      orders: true,
      items: true,
      loading: true,
      tasks: true,
    },
  });
  if (!sheet) return null;

  // Похідні документи (Реалізації + Оплати) — за зворотним посиланням.
  const [sales, payments] = await Promise.all([
    prisma.sale.findMany({
      where: { routeSheetId },
      select: {
        code1C: true,
        orderId: true,
        totalEur: true,
        customer: { select: { code1C: true } },
      },
    }),
    prisma.mgrCashOrder.findMany({
      where: { routeSheetId },
      select: {
        code1C: true,
        type: true,
        documentSumEur: true,
        saleId: true,
        customer: { select: { code1C: true } },
        sale: {
          select: { code1C: true, customer: { select: { code1C: true } } },
        },
      },
    }),
  ]);

  // ─── Batch-резолв cross-model code1C/штрихкодів (плоскі скаляри у дочірніх) ──
  const orderIds = new Set<string>();
  const customerIds = new Set<string>();
  const productIds = new Set<string>();
  const lotIds = new Set<string>();
  const taskClientIds = new Set<string>();
  for (const o of sheet.orders) {
    orderIds.add(o.orderId);
    if (o.customerId) customerIds.add(o.customerId);
  }
  for (const it of sheet.items) {
    if (it.orderId) orderIds.add(it.orderId);
    if (it.customerId) customerIds.add(it.customerId);
    productIds.add(it.productId);
    if (it.lotId) lotIds.add(it.lotId);
  }
  for (const ld of sheet.loading) {
    if (ld.orderId) orderIds.add(ld.orderId);
    if (ld.customerId) customerIds.add(ld.customerId);
    productIds.add(ld.productId);
    lotIds.add(ld.lotId);
  }
  for (const s of sales) {
    if (s.orderId) orderIds.add(s.orderId);
  }
  // Завдання — клієнт із менеджерського довідника (MgrClient).
  for (const t of sheet.tasks) {
    if (t.customerId) taskClientIds.add(t.customerId);
  }

  const [orders, customers, products, lots, taskClients] = await Promise.all([
    orderIds.size > 0
      ? prisma.order.findMany({
          where: { id: { in: [...orderIds] } },
          select: { id: true, code1C: true },
        })
      : Promise.resolve([]),
    customerIds.size > 0
      ? prisma.customer.findMany({
          where: { id: { in: [...customerIds] } },
          select: { id: true, code1C: true },
        })
      : Promise.resolve([]),
    productIds.size > 0
      ? prisma.product.findMany({
          where: { id: { in: [...productIds] } },
          select: { id: true, code1C: true },
        })
      : Promise.resolve([]),
    lotIds.size > 0
      ? prisma.lot.findMany({
          where: { id: { in: [...lotIds] } },
          select: { id: true, barcode: true },
        })
      : Promise.resolve([]),
    taskClientIds.size > 0
      ? prisma.mgrClient.findMany({
          where: { id: { in: [...taskClientIds] } },
          select: { id: true, code1C: true },
        })
      : Promise.resolve([]),
  ]);
  const orderCode = new Map(orders.map((o) => [o.id, o.code1C]));
  const customerCode = new Map(customers.map((c) => [c.id, c.code1C]));
  const productCode = new Map(products.map((p) => [p.id, p.code1C]));
  const lotBarcode = new Map(lots.map((l) => [l.id, l.barcode]));
  const taskClientCode = new Map(taskClients.map((c) => [c.id, c.code1C]));

  const payload = buildRouteSheetCreatePayload({
    sheet,
    routeCode1C: sheet.route?.code1C ?? null,
    expeditorCode1C: sheet.expeditor?.code1C ?? null,
    orders: sheet.orders.map((o) => ({
      orderCode1C: orderCode.get(o.orderId) ?? null,
      customerCode1C: o.customerId
        ? (customerCode.get(o.customerId) ?? null)
        : null,
      city: o.city,
    })),
    items: sheet.items.map((it) => ({
      orderCode1C: it.orderId ? (orderCode.get(it.orderId) ?? null) : null,
      customerCode1C: it.customerId
        ? (customerCode.get(it.customerId) ?? null)
        : null,
      productCode1C: productCode.get(it.productId) ?? null,
      lotBarcode: it.lotId ? (lotBarcode.get(it.lotId) ?? null) : null,
      unit: it.unit,
      quantity: it.quantity,
      quantityLoaded: it.quantityLoaded,
      price: it.price,
      sum: it.sum,
    })),
    loading: sheet.loading.map((ld) => ({
      orderCode1C: ld.orderId ? (orderCode.get(ld.orderId) ?? null) : null,
      customerCode1C: ld.customerId
        ? (customerCode.get(ld.customerId) ?? null)
        : null,
      productCode1C: productCode.get(ld.productId) ?? null,
      lotBarcode: lotBarcode.get(ld.lotId) ?? ld.barcode,
      unit: ld.unit,
      quantity: ld.quantity,
      weight: ld.weight,
      price: ld.price,
      sum: ld.sum,
      pricePerKg: ld.pricePerKg,
      loaded: ld.loaded,
      isReturn: ld.isReturn,
    })),
    sales: sales.map((s) => ({
      saleCode1C: s.code1C,
      orderCode1C: s.orderId ? (orderCode.get(s.orderId) ?? null) : null,
      customerCode1C: s.customer?.code1C ?? null,
      sum: s.totalEur,
    })),
    payments: payments.map((p) => ({
      cashOrderCode1C: p.code1C,
      saleCode1C: p.sale?.code1C ?? null,
      customerCode1C: p.customer?.code1C ?? p.sale?.customer?.code1C ?? null,
      type: p.type,
      amount: p.documentSumEur,
    })),
    tasks: sheet.tasks.map((t) => ({
      customerCode1C: t.customerId
        ? (taskClientCode.get(t.customerId) ?? null)
        : null,
      comment: t.comment,
    })),
  });

  return prisma.mgrSyncJob.create({
    data: {
      entityType: "route_sheet",
      entityId: sheet.id,
      action: "create",
      payload: payload as unknown as Prisma.InputJsonValue,
      idempotencyKey: randomUUID(),
      nextAttemptAt: new Date(),
    },
  });
}
