import { Prisma, prisma } from "@ltex/db";
import { getCurrentRate } from "@/lib/exchange-rate";
import {
  buildSaleEventBody,
  recordClientEventSafe,
} from "@/lib/manager/client-timeline";
import {
  applyDebtMovementTx,
  recomputeDebtForClientsSafe,
} from "@/lib/manager/debt-register";
import { applySaleMovements } from "@/lib/manager/sale-movement-hooks";
import { notifyOrdersClosedBySale } from "@/lib/manager/sale-order-close";
import { createWarehouseTaskForSale } from "@/lib/manager/warehouse-task";
import { createTtnForSale } from "@/lib/delivery/create-ttn-for-sale";
import type {
  CreateSaleInputRaw,
  SaleDraftInput,
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
 * Обмінів із 1С немає — лише локальна логіка. При проведенні (`post`) рух боргу
 * (`MgrDebtMovement`) пишеться у ТІЙ САМІЙ транзакції, що й реалізація (Блок C1):
 * документ і його борг-рух комітяться атомарно. Перерахунок кешу
 * `MgrClient.debt` — після коміту (похідний), історія клієнта та нагадування —
 * fire-and-forget, не блокують відповідь.
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

  // Клієнт руху боргу — резолвиться всередині транзакції; повертається назовні
  // для перерахунку кешу боргу ПІСЛЯ коміту.
  let debtClientId: string | null = null;

  const sale = await prisma.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        customerId: customer.id,
        // «Зберегти» → `not_posted` (створене, рухи по реєстрах ще не йдуть);
        // «Зберегти та провести» → `posted` (+архів). Чернетка (`draft`)
        // ставиться лише легким autosave-шляхом (`createSaleDraft`).
        status: post ? "posted" : "not_posted",
        archived: post,
        totalEur,
        totalUah,
        exchangeRateEur: rateEur,
        exchangeRateUsd: rateUsd,
        notes: input.notes,
        priceTypeId: input.priceTypeId ?? null,
        deliveryMethod: input.deliveryMethod ?? null,
        novaPoshtaBranch: input.novaPoshtaBranch ?? null,
        npCityRef: input.npCityRef ?? null,
        npCityName: input.npCityName ?? null,
        npWarehouseRef: input.npWarehouseRef ?? null,
        npWarehouseName: input.npWarehouseName ?? null,
        npDeliveryType: input.npDeliveryType ?? null,
        npRecipientName: input.npRecipientName ?? null,
        npRecipientPhone: input.npRecipientPhone ?? null,
        npPayerType: input.npPayerType ?? null,
        deliveryAddress: input.deliveryAddress ?? null,
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

    // C1: рух боргу при проведенні (+totalEur — борг клієнта зростає) — АТОМАРНО
    // з документом. Ідемпотентно за sourceType+sourceId; чернетка руху не створює.
    if (post) {
      debtClientId = await applyDebtMovementTx(tx, {
        customerId: created.customerId,
        amountEur: Number(created.totalEur),
        kind: "sale",
        sourceType: "sale",
        sourceId: created.id,
        occurredAt: created.createdAt ?? new Date(),
        note: "Реалізація проведена",
        createdByUserId: actor.userId,
      });
    }

    return created;
  });

  // C1: перерахунок кешу боргу — ПІСЛЯ коміту (кеш похідний, поза транзакцією).
  if (debtClientId) {
    await recomputeDebtForClientsSafe([debtClientId]);
  }

  // Авто-запис історії клієнта (Фаза 4) — fire-and-forget, не блокує відповідь.
  recordClientEventSafe({
    customerId: sale.customerId,
    kind: "sale",
    body: buildSaleEventBody(sale.totalUah, sale.items.length),
    authorUserId: actor.userId,
    metadata: { saleId: sale.id },
  });

  // 7.3: нагадування менеджеру, якщо реалізація могла закрити замовлення.
  if (post) {
    // Рухи регістрів (склад/продажі/собівартість) при проведенні — best-effort,
    // ідемпотентно (delete-then-create за реєстратором sale.code1C ?? sale.id).
    applySaleMovements(sale.id);
    // Завдання складу (підготувати лоти + ТТН) — при проведенні, fire-and-forget.
    // Після створення завдання — авто-створення ТТН НП (best-effort, пише №ТТН
    // у Sale + завдання; помилку — у Sale.ttnError, UI показує «Повторити»).
    void createWarehouseTaskForSale(sale.id).then(() =>
      createTtnForSale(sale.id),
    );
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

  // Клієнт руху боргу — резолвиться у транзакції, для перерахунку кешу після.
  let debtClientId: string | null = null;

  const sale = await prisma.$transaction(async (tx) => {
    await tx.saleItem.deleteMany({ where: { saleId } });
    const updated = await tx.sale.update({
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
        npCityRef: input.npCityRef ?? null,
        npCityName: input.npCityName ?? null,
        npWarehouseRef: input.npWarehouseRef ?? null,
        npWarehouseName: input.npWarehouseName ?? null,
        npDeliveryType: input.npDeliveryType ?? null,
        npRecipientName: input.npRecipientName ?? null,
        npRecipientPhone: input.npRecipientPhone ?? null,
        npPayerType: input.npPayerType ?? null,
        deliveryAddress: input.deliveryAddress ?? null,
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

    // C1: рух боргу при переході у `posted` (проведення з картки реалізації) —
    // АТОМАРНО з документом. Ідемпотентно за sourceType+sourceId (повторне
    // проведення лише оновить суму).
    if (becomesArchived) {
      debtClientId = await applyDebtMovementTx(tx, {
        customerId: updated.customerId,
        amountEur: Number(updated.totalEur),
        kind: "sale",
        sourceType: "sale",
        sourceId: updated.id,
        occurredAt: updated.createdAt ?? new Date(),
        note: "Реалізація проведена",
        createdByUserId: _actor.userId,
      });
    }

    return updated;
  });

  // C1: перерахунок кешу боргу — ПІСЛЯ коміту (кеш похідний).
  if (debtClientId) {
    await recomputeDebtForClientsSafe([debtClientId]);
  }

  // 7.3: нагадування менеджеру, якщо реалізація могла закрити замовлення.
  if (becomesArchived) {
    // Рухи регістрів (склад/продажі/собівартість) при проведенні з картки.
    applySaleMovements(sale.id);
    // Завдання складу (підготувати лоти + ТТН) — при проведенні з картки.
    // Після завдання — авто-створення ТТН НП (best-effort).
    void createWarehouseTaskForSale(sale.id).then(() =>
      createTtnForSale(sale.id),
    );
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

// ─── Автозбереження чернетки (draft) ────────────────────────────────────────
//
// Легкі шляхи для наскрізного autosave (План AUTOSAVE_REALTIME_PLAN §2, рівень
// 2). Пишуть ЛИШЕ шапку + рядки зі `status="draft"` (`archived=false`) БЕЗ
// жодних ефектів проведення: не чіпають рух боргу (`MgrDebtMovement`), регістри
// складу/продажів/собівартості (`applySaleMovements`), історію клієнта та
// нагадування. Це робить autosave безпечним для обліку — облікові рухи
// з'являються ЛИШЕ при «Провести» (`createSaleWithItems`/`updateSaleWithItems`
// з `post`/`nextStatus="posted"`).

/**
 * Створює чернетку реалізації (`status="draft"`) — легкий шлях autosave.
 * Повертає лише поля, потрібні формі (`id` для присвоєння URL-у + шапка).
 */
export async function createSaleDraft(
  input: SaleDraftInput,
  customer: CreateSaleCustomer,
  actor: CreateSaleActor,
) {
  const rateEur = input.exchangeRateEur ?? (await getCurrentRate());
  const rateUsd = input.exchangeRateUsd ?? 0;
  const items = (input.items ?? []) as SaleItemInput[];
  const { totalEur, totalUah, itemRows } = buildSaleTotals(items, rateEur);
  const cashOnDelivery = input.cashOnDelivery ?? false;

  return prisma.sale.create({
    data: {
      customerId: customer.id,
      status: "draft",
      archived: false,
      totalEur,
      totalUah,
      exchangeRateEur: rateEur,
      exchangeRateUsd: rateUsd,
      notes: input.notes ?? null,
      priceTypeId: input.priceTypeId ?? null,
      deliveryMethod: input.deliveryMethod ?? null,
      novaPoshtaBranch: input.novaPoshtaBranch ?? null,
      npCityRef: input.npCityRef ?? null,
      npCityName: input.npCityName ?? null,
      npWarehouseRef: input.npWarehouseRef ?? null,
      npWarehouseName: input.npWarehouseName ?? null,
      npDeliveryType: input.npDeliveryType ?? null,
      npRecipientName: input.npRecipientName ?? null,
      npRecipientPhone: input.npRecipientPhone ?? null,
      npPayerType: input.npPayerType ?? null,
      deliveryAddress: input.deliveryAddress ?? null,
      cashOnDelivery,
      codAmountUah: codAmountFor(cashOnDelivery, totalUah),
      assignedAgentUserId: input.assignedAgentUserId ?? null,
      onTradeAgent: input.onTradeAgent ?? true,
      expressWaybill: input.expressWaybill ?? null,
      routeSheetId: input.routeSheetId ?? null,
      items: { create: itemRows },
    },
    select: { id: true, status: true, docNumber: true, code1C: true },
  });
  // actor лишається у сигнатурі для симетрії з create/update та майбутнього
  // авторства чернетки; наразі draft не пише авторських слідів.
}

/**
 * Оновлює чернетку реалізації (повна заміна шапки + items) — легкий шлях
 * autosave. Статус НЕ змінюється (лишається як є, зазвичай `draft`/`sent`);
 * жодних ефектів проведення. Caller (endpoint) гарантує, що документ не
 * заблокований (`isSaleLocked`).
 */
export async function updateSaleDraft(saleId: string, input: SaleDraftInput) {
  const rateEur = input.exchangeRateEur ?? (await getCurrentRate());
  const rateUsd = input.exchangeRateUsd ?? 0;
  const items = (input.items ?? []) as SaleItemInput[];
  const { totalEur, totalUah, itemRows } = buildSaleTotals(items, rateEur);
  const cashOnDelivery = input.cashOnDelivery ?? false;

  return prisma.$transaction(async (tx) => {
    await tx.saleItem.deleteMany({ where: { saleId } });
    return tx.sale.update({
      where: { id: saleId },
      data: {
        totalEur,
        totalUah,
        exchangeRateEur: rateEur,
        exchangeRateUsd: rateUsd,
        notes: input.notes ?? null,
        priceTypeId: input.priceTypeId ?? null,
        deliveryMethod: input.deliveryMethod ?? null,
        novaPoshtaBranch: input.novaPoshtaBranch ?? null,
        npCityRef: input.npCityRef ?? null,
        npCityName: input.npCityName ?? null,
        npWarehouseRef: input.npWarehouseRef ?? null,
        npWarehouseName: input.npWarehouseName ?? null,
        npDeliveryType: input.npDeliveryType ?? null,
        npRecipientName: input.npRecipientName ?? null,
        npRecipientPhone: input.npRecipientPhone ?? null,
        npPayerType: input.npPayerType ?? null,
        deliveryAddress: input.deliveryAddress ?? null,
        cashOnDelivery,
        codAmountUah: codAmountFor(cashOnDelivery, totalUah),
        assignedAgentUserId: input.assignedAgentUserId ?? null,
        onTradeAgent: input.onTradeAgent ?? true,
        expressWaybill: input.expressWaybill ?? null,
        items: { create: itemRows },
      },
      select: { id: true, status: true, docNumber: true, code1C: true },
    });
  });
}
