import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@ltex/db";
import type { ClientUpdatePayload } from "@/lib/validations/sync-job";

/**
 * Збирає payload для 1С `ОбновитиКлієнта` з MgrClient row + relations
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
 * payload-у `СтворитиЗамовлення` SOAP-operation (див. docs/1C_SYNC_MODULES_SPEC.md §3.2).
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
 * order.code1C для payload-у `СтворитиОплату`.
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
 * `СтворитиРеалізацію` SOAP-operation (див. docs/1C_SYNC_MODULES_SPEC.md §3.4).
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
