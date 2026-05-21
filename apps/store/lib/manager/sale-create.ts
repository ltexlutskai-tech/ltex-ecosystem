import { Prisma, prisma } from "@ltex/db";
import { getCurrentRate } from "@/lib/exchange-rate";
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
 *  - **БЕЗ enqueue/sync** — обмін з 1С робиться окремо на Етапі 5.
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
 * **БЕЗ обміну з 1С** — sync робиться окремо на Етапі 5.
 */
export async function createSaleWithItems(
  input: CreateSaleInputRaw,
  customer: CreateSaleCustomer,
  _actor: CreateSaleActor,
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
      items: { create: itemRows },
    },
    include: SALE_INCLUDE,
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
 * **БЕЗ обміну з 1С** — sync робиться окремо на Етапі 5.
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

  return sale;
}
