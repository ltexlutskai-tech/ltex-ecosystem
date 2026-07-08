import { Prisma, prisma } from "@ltex/db";
import { getCurrentRate } from "@/lib/exchange-rate";
import {
  buildSaleEventBody,
  recordClientEventSafe,
} from "@/lib/manager/client-timeline";
import { applyDebtMovementSafe } from "@/lib/manager/debt-register";
import { applySaleMovements } from "@/lib/manager/sale-movement-hooks";
import { notifyOrdersClosedBySale } from "@/lib/manager/sale-order-close";
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
 *    (оплати з'являться у Етапі 4, тож зараз paid = 0 → COD = round(totalUah)).
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

  // Проведення документа (кнопка «Зберегти та провести») → posted + archived.
  const post = input.post === true;

  const sale = await prisma.sale.create({
    data: {
      customerId: customer.id,
      status: post ? "posted" : "draft",
      archived: post,
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

  // Авто-запис історії клієнта (Фаза 4) — fire-and-forget, не блокує відповідь.
  recordClientEventSafe({
    customerId: sale.customerId,
    kind: "sale",
    body: buildSaleEventBody(sale.totalUah, sale.items.length),
    authorUserId: actor.userId,
    metadata: { saleId: sale.id },
  });

  // 5.4.5b: рух боргу при проведенні (+totalEur — борг клієнта зростає).
  // Ідемпотентно за sourceType+sourceId; чернетка (draft) рух НЕ створює.
  if (post) {
    applyDebtMovementSafe({
      customerId: sale.customerId,
      amountEur: Number(sale.totalEur),
      kind: "sale",
      sourceType: "sale",
      sourceId: sale.id,
      occurredAt: sale.createdAt ?? new Date(),
      note: "Реалізація проведена",
      createdByUserId: actor.userId,
    });
    // Рухи регістрів (склад/продажі/собівартість) при проведенні — best-effort,
    // ідемпотентно (delete-then-create за реєстратором sale.code1C ?? sale.id).
    applySaleMovements(sale.id);
    // 7.3: нагадування менеджеру, якщо реалізація могла закрити замовлення.
    void notifyOrdersClosedBySale({
      saleId: sale.id,
      saleNumber1C: sale.number1C,
      saleCode1C: sale.code1C,
      saleDocNumber: sale.docNumber,
      customerId: sale.customerId,
      actorUserId: actor.userId,
    });
  }

  return sale;
}

/**
 * Оновлює існуючу Sale (шапка + повна заміна items) атомарно у
 * `prisma.$transaction` і перераховує totals (як `createSaleWithItems`).
 *
 * Items замінюються повністю (deleteMany + create), щоб не вести складний diff.
 * Зміна статусу (якщо передана) застосовується у тій самій транзакції;
 * валідність переходу перевіряє caller (endpoint) до виклику.
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

  // Проведення (`posted`) → документ архівується.
  const becomesArchived = options?.nextStatus === "posted";

  const sale = await prisma.$transaction(async (tx) => {
    await tx.saleItem.deleteMany({ where: { saleId } });
    return tx.sale.update({
      where: { id: saleId },
      data: {
        status: options?.nextStatus,
        ...(becomesArchived ? { archived: true } : {}),
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

  // 5.4.5b: рух боргу при переході у `posted` (проведення з картки реалізації).
  // Ідемпотентно за sourceType+sourceId — повторне проведення лише оновить суму.
  if (becomesArchived) {
    applyDebtMovementSafe({
      customerId: sale.customerId,
      amountEur: Number(sale.totalEur),
      kind: "sale",
      sourceType: "sale",
      sourceId: sale.id,
      occurredAt: sale.createdAt ?? new Date(),
      note: "Реалізація проведена",
      createdByUserId: _actor.userId,
    });
    // Рухи регістрів (склад/продажі/собівартість) при проведенні з картки.
    applySaleMovements(sale.id);
    // 7.3: нагадування менеджеру, якщо реалізація могла закрити замовлення.
    void notifyOrdersClosedBySale({
      saleId: sale.id,
      saleNumber1C: sale.number1C,
      saleCode1C: sale.code1C,
      saleDocNumber: sale.docNumber,
      customerId: sale.customerId,
      actorUserId: _actor.userId,
    });
  }

  return sale;
}
