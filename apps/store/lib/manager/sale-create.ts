import { Prisma, prisma } from "@ltex/db";
import { getCurrentRate } from "@/lib/exchange-rate";
import { enqueueSaleCreate } from "@/lib/sync/enqueue";
import {
  buildSaleEventBody,
  recordClientEventSafe,
} from "@/lib/manager/client-timeline";
import type {
  CreateSaleInputRaw,
  SaleItemInput,
  UpdateSaleInputRaw,
} from "@/lib/validations/manager-sale";

/**
 * Блок «Реалізація» — Етап 2. Створення/редагування документа + рядків.
 *
 * Адаптовано з `order-create.ts`. Ключові відмінності:
 *  - рядок несе `pricePerKg` (ЦенаПродажиВес) + опційний `barcode`/`lotId`
 *    (заповнюються при скані ШК; при підборі через прайс — `lotId` null);
 *  - totals = `totalEur = Σ priceEur`, `totalUah = round(totalEur × курсEUR)`;
 *  - `codAmountUah` (сума післяплати) обчислюється коли `cashOnDelivery`
 *    (оплати з'являться у Етапі 4, тож зараз paid = 0 → COD = round(totalUah));
 *  - **Етап 5:** після persist — fire-and-forget enqueue до 1С
 *    (`СтворитиРеалізацію`), best-effort як Order/PATCH-client. Транспорт
 *    замокано (`SYNC_MOCK_MODE`); реальний BSL — у docs/1C_SYNC_MODULES_SPEC.md §3.4.
 */

export interface CreateSaleCustomer {
  id: string;
  code1C: string | null;
  name: string;
}

export interface CreateSaleActor {
  /** id поточного менеджера — дефолт для assignedAgentUserId (через UI). */
  userId: string;
}

/** include-блок, що віддаємо з create/update — спільний для обох. */
const SALE_INCLUDE = {
  items: {
    include: {
      product: { select: { code1C: true } },
      lot: { select: { barcode: true } },
    },
  },
  customer: { select: { id: true, code1C: true, name: true } },
} satisfies Prisma.SaleInclude;

/**
 * Чиста (без I/O) калькуляція totals + нормалізація рядків реалізації.
 *
 * - `totalEur = Σ items.priceEur` (priceEur рядка — **сумарна** ціна позиції);
 * - `totalUah = round(totalEur × rate)` (rate — курс EUR→UAH документа);
 * - items нормалізуються до Prisma-create shape (`lotId ?? null`,
 *   `barcode ?? null`, `quantity ?? 1`, `pricePerKg`).
 */
export function buildSaleTotals(
  items: SaleItemInput[],
  rateEur: number,
): {
  totalEur: number;
  totalUah: number;
  itemRows: Array<{
    productId: string;
    lotId: string | null;
    barcode: string | null;
    pricePerKg: number;
    priceEur: number;
    weight: number;
    quantity: number;
  }>;
} {
  const totalEur = items.reduce((sum, i) => sum + i.priceEur, 0);
  const totalUah = Math.round(totalEur * rateEur);
  const itemRows = items.map((item) => ({
    productId: item.productId,
    lotId: item.lotId ?? null,
    barcode: item.barcode ?? null,
    pricePerKg: item.pricePerKg,
    priceEur: item.priceEur,
    weight: item.weight,
    quantity: item.quantity ?? 1,
  }));
  return { totalEur, totalUah, itemRows };
}

/**
 * Сума післяплати (COD) у грн. Оплати з'являться у Етапі 4, тож зараз
 * вважаємо paid = 0 і повертаємо повну суму документа округлену до цілих грн.
 * Якщо наложки немає — `null`.
 */
function codAmountFor(
  cashOnDelivery: boolean,
  totalUah: number,
): number | null {
  if (!cashOnDelivery) return null;
  return Math.round(totalUah);
}

/**
 * Створює Sale + items атомарно у `prisma.$transaction`. Розраховує
 * `totalEur = Σ priceEur` та `totalUah = round(totalEur × курсEUR)`
 * (курс — input.exchangeRateEur якщо передано, інакше `getCurrentRate()`).
 *
 * Менеджерські поля: priceTypeId / deliveryMethod / novaPoshtaBranch /
 * cashOnDelivery (+codAmountUah) / assignedAgentUserId (дефолт null —
 * призначає UI) / onTradeAgent / exportTo1C / expressWaybill.
 *
 * Після успіху — **fire-and-forget** enqueue до 1С (`enqueueSaleSyncSafe`).
 * Якщо enqueue падає — sale вже existing, користувач бачить успіх. Той самий
 * best-effort pattern як `createOrderWithItems`.
 */
export async function createSaleWithItems(
  input: CreateSaleInputRaw,
  customer: CreateSaleCustomer,
  actor: CreateSaleActor,
) {
  const rateEur = input.exchangeRateEur ?? (await getCurrentRate());
  const rateUsd = input.exchangeRateUsd ?? 0;
  const items = (input.items ?? []) as SaleItemInput[];
  const { totalEur, totalUah, itemRows } = buildSaleTotals(items, rateEur);
  const cashOnDelivery = input.cashOnDelivery ?? false;

  const sale = await prisma.sale.create({
    data: {
      customerId: customer.id,
      status: "draft",
      totalEur,
      totalUah,
      exchangeRateEur: rateEur,
      exchangeRateUsd: rateUsd,
      notes: input.notes,
      priceTypeId: input.priceTypeId ?? null,
      deliveryMethod: input.deliveryMethod ?? null,
      novaPoshtaBranch: input.novaPoshtaBranch ?? null,
      cashOnDelivery,
      codAmountUah: codAmountFor(cashOnDelivery, totalUah),
      assignedAgentUserId: input.assignedAgentUserId ?? null,
      onTradeAgent: input.onTradeAgent ?? true,
      exportTo1C: input.exportTo1C ?? true,
      expressWaybill: input.expressWaybill ?? null,
      routeSheetId: input.routeSheetId ?? null,
      items: { create: itemRows },
    },
    include: SALE_INCLUDE,
  });

  enqueueSaleSyncSafe(sale);

  // Авто-запис історії клієнта (Фаза 4) — fire-and-forget, не блокує відповідь.
  recordClientEventSafe({
    customerId: sale.customerId,
    kind: "sale",
    body: buildSaleEventBody(sale.totalUah, sale.items.length),
    authorUserId: actor.userId,
    metadata: { saleId: sale.id },
  });

  return sale;
}

/**
 * Оновлює існуючу Sale (шапка + повна заміна items) атомарно у
 * `prisma.$transaction` і перераховує totals (як `createSaleWithItems`).
 *
 * Items замінюються повністю (deleteMany + create), щоб не вести складний diff.
 * Зміна статусу (якщо передана) застосовується у тій самій транзакції;
 * валідність переходу перевіряє caller (endpoint) до виклику.
 *
 * Після успіху — fire-and-forget enqueue до 1С (best-effort, як create).
 */
export async function updateSaleWithItems(
  saleId: string,
  input: UpdateSaleInputRaw,
  _actor: CreateSaleActor,
  options?: { nextStatus?: string },
) {
  const rateEur = input.exchangeRateEur ?? (await getCurrentRate());
  const rateUsd = input.exchangeRateUsd ?? 0;
  const items = (input.items ?? []) as SaleItemInput[];
  const { totalEur, totalUah, itemRows } = buildSaleTotals(items, rateEur);
  const cashOnDelivery = input.cashOnDelivery ?? false;

  const sale = await prisma.$transaction(async (tx) => {
    await tx.saleItem.deleteMany({ where: { saleId } });
    return tx.sale.update({
      where: { id: saleId },
      data: {
        status: options?.nextStatus,
        totalEur,
        totalUah,
        exchangeRateEur: rateEur,
        exchangeRateUsd: rateUsd,
        notes: input.notes ?? null,
        priceTypeId: input.priceTypeId ?? null,
        deliveryMethod: input.deliveryMethod ?? null,
        novaPoshtaBranch: input.novaPoshtaBranch ?? null,
        cashOnDelivery,
        codAmountUah: codAmountFor(cashOnDelivery, totalUah),
        assignedAgentUserId: input.assignedAgentUserId ?? null,
        onTradeAgent: input.onTradeAgent ?? true,
        exportTo1C: input.exportTo1C ?? true,
        expressWaybill: input.expressWaybill ?? null,
        items: { create: itemRows },
      },
      include: SALE_INCLUDE,
    });
  });

  enqueueSaleSyncSafe(sale);

  return sale;
}

type SaleWithSyncRelations = Prisma.SaleGetPayload<{
  include: typeof SALE_INCLUDE;
}>;

/** Fire-and-forget enqueue до 1С — однаково для create й update. */
function enqueueSaleSyncSafe(sale: SaleWithSyncRelations): void {
  enqueueSaleCreate({
    id: sale.id,
    code1C: sale.code1C,
    docNumber: sale.docNumber,
    totalEur: sale.totalEur,
    totalUah: sale.totalUah,
    exchangeRateEur: sale.exchangeRateEur,
    exchangeRateUsd: sale.exchangeRateUsd,
    priceTypeId: sale.priceTypeId,
    deliveryMethod: sale.deliveryMethod,
    novaPoshtaBranch: sale.novaPoshtaBranch,
    cashOnDelivery: sale.cashOnDelivery,
    codAmountUah: sale.codAmountUah,
    assignedAgentUserId: sale.assignedAgentUserId,
    onTradeAgent: sale.onTradeAgent,
    expressWaybill: sale.expressWaybill,
    notes: sale.notes,
    customer: { code1C: sale.customer.code1C, name: sale.customer.name },
    items: sale.items.map((i) => ({
      productId: i.productId,
      lotId: i.lotId,
      pricePerKg: i.pricePerKg,
      weight: i.weight,
      quantity: i.quantity,
      priceEur: i.priceEur,
      product: i.product ? { code1C: i.product.code1C } : null,
      lot: i.lot ? { barcode: i.lot.barcode } : null,
    })),
  }).catch((e: unknown) => {
    console.warn("[L-TEX] Failed to enqueue sale sync", {
      saleId: sale.id,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}
