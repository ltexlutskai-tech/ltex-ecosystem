import { prisma } from "@ltex/db";
import { normalizePhone } from "@ltex/shared";
import { classifyDelivery } from "@/lib/manager/order-delivery";
import { getDeliveryLabelResolver } from "@/lib/manager/delivery-methods";
import {
  buildReceiptNameResolver,
  resolveReceiptName,
  type CategoryNode,
} from "@/lib/manager/receipt-name";
import {
  createInternetDocument,
  updateInternetDocument,
  ensureRecipientPrivatePerson,
  getSenderCounterparty,
  getSenderContact,
  type CreateTtnInput,
  type NpSeatOption,
} from "@/lib/delivery/nova-poshta";

/**
 * Створення / оновлення ТТН Нової Пошти для реалізації.
 *
 * Фаза 1 — `createTtnForSale`: fire-and-forget одразу після
 * `createWarehouseTaskForSale` при проведенні. Місця/вага орієнтовні.
 * Фаза 2 — `updateTtnForSale`: склад передає ФАКТИЧНІ місця (габарити/вага) →
 * оновлюємо ТТН (`InternetDocument.update`, SeatsAmount + OptionsSeat).
 *
 * Правила (рішення user):
 *  - ТТН для ВСІХ відправлень Новою Поштою (`deliveryKind === "post"`).
 *  - Отримувач — приватна особа (ПІБ+телефон з реалізації, префіл з картки клієнта).
 *  - Платник доставки — з `Sale.npPayerType` (дефолт «отримувач»).
 *  - Накладка = «Контроль оплати» (`AfterpaymentOnGoodsCost`, гроші на рахунок ФОП
 *    через NovaPay), НЕ класична післяплата.
 *  - Оголошена цінність = сума реалізації (₴), або мінімальна, якщо вимкнено.
 *
 * Best-effort: НЕ кидає. Помилку пишемо у `Sale.ttnError` (UI показує «Повторити»).
 */

const MIN_DECLARED_UAH = 300;
const MIN_WEIGHT_KG = 0.1;

/** Габарити місця відправлення (склад, Фаза 2). */
export interface SeatDims {
  weight: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  // «Ручна обробка» — зберігаємо для складу; у публічне API НП НЕ передаємо.
  manualHandling?: boolean;
}

// НП вимагає габарити ≥ 5 см на кожну сторону, коли передається OptionsSeat.
const MIN_DIM_CM = 5;

/** Розбиває «Прізвище Ім'я По-батькові» на частини для NP PrivatePerson. */
export function splitRecipientName(raw: string): {
  firstName: string;
  lastName: string;
  middleName: string;
} {
  const parts = raw
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  const lastName = parts[0] ?? raw.trim();
  // NP вимагає непорожнє ім'я; для однослівних назв дублюємо прізвище.
  const firstName = parts[1] ?? lastName;
  const middleName = parts.slice(2).join(" ");
  return { firstName, lastName, middleName };
}

async function setTtnError(saleId: string, message: string): Promise<void> {
  try {
    await prisma.sale.update({
      where: { id: saleId },
      data: { ttnError: message.slice(0, 500) },
    });
  } catch {
    // best-effort — ігноруємо
  }
}

type BuildResult =
  | { kind: "skip" }
  | { kind: "error"; message: string }
  | { kind: "ok"; input: CreateTtnInput; ttnRef: string | null };

/**
 * Будує `CreateTtnInput` з реалізації — спільне для створення й оновлення ТТН.
 * Якщо `opts.seats` задані й непорожні — переозначають місця/вагу/габарити
 * (склад на «Готово»); інакше беруться орієнтовні (вага = сума рядків, місць =
 * к-сть рядків, без OptionsSeat).
 */
async function buildTtnInputForSale(
  saleId: string,
  opts?: { seats?: SeatDims[] },
): Promise<BuildResult> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      items: {
        include: {
          product: {
            select: { receiptName: true, categoryId: true, name: true },
          },
        },
      },
      customer: { select: { name: true } },
    },
  });
  if (!sale) return { kind: "skip" };

  // Лише Нова Пошта.
  const labelResolver = await getDeliveryLabelResolver();
  const kind = classifyDelivery(
    sale.deliveryMethod,
    sale.deliveryMethod ? labelResolver(sale.deliveryMethod) : null,
  );
  if (kind !== "post") return { kind: "skip" };

  if (!sale.npCityRef || !sale.npWarehouseRef) {
    return {
      kind: "error",
      message:
        "Оберіть місто й відділення Нової Пошти у реалізації, потім «Повторити».",
    };
  }

  // Отримувач: ПІБ + телефон.
  const recipientName = (sale.npRecipientName ?? sale.customer.name).trim();
  const recipientPhone = normalizePhone(sale.npRecipientPhone);
  if (!recipientName) {
    return { kind: "error", message: "Вкажіть ПІБ отримувача у реалізації." };
  }
  if (!recipientPhone) {
    return { kind: "error", message: "Вкажіть коректний телефон отримувача." };
  }

  // Відправник (з env + кешований контрагент/контакт NP).
  const senderCityRef = process.env.NP_SENDER_CITY_REF;
  const senderWarehouseRef = process.env.NP_SENDER_WAREHOUSE_REF;
  const senderPhone = process.env.NP_SENDER_PHONE;
  if (!senderCityRef || !senderWarehouseRef || !senderPhone) {
    return {
      kind: "error",
      message: "Не налаштовано відправника НП (NP_SENDER_* у .env).",
    };
  }
  const counterparty = await getSenderCounterparty();
  if (!counterparty) {
    return {
      kind: "error",
      message:
        "Не вдалося отримати контрагента-відправника НП (перевірте ключ API).",
    };
  }
  const contact = await getSenderContact(counterparty.ref);
  if (!contact) {
    return {
      kind: "error",
      message: "Не вдалося отримати контакт відправника НП.",
    };
  }

  // Отримувач у NP (приватна особа).
  const name = splitRecipientName(recipientName);
  const npPhone = recipientPhone.replace(/^\+/, "");
  const recipient = await ensureRecipientPrivatePerson({
    firstName: name.firstName,
    lastName: name.lastName,
    middleName: name.middleName || undefined,
    phone: npPhone,
  });
  if ("error" in recipient) {
    return { kind: "error", message: `Отримувач: ${recipient.error}` };
  }

  // Вага/місця: фактичні складські місця (Фаза 2), інакше орієнтовні.
  const seats = (opts?.seats ?? []).filter(
    (s) => s.weight > 0 || s.lengthCm > 0 || s.widthCm > 0 || s.heightCm > 0,
  );
  const itemsWeight = sale.items.reduce((sum, it) => sum + (it.weight || 0), 0);
  let weight: number;
  let seatsAmount: number;
  let optionsSeat: NpSeatOption[] | undefined;
  // «Ручна обробка» хоч на одному місці → CargoType=Cargo (мішки; вантажне
  // відділення-отримувач, габарити ≤ 120 см — контролює склад при виборі місць).
  const anyManual = seats.some((s) => s.manualHandling);
  if (seats.length > 0) {
    const seatWeight = seats.reduce((s, x) => s + (x.weight || 0), 0);
    weight = Math.max(
      MIN_WEIGHT_KG,
      Math.round((seatWeight || itemsWeight) * 100) / 100,
    );
    seatsAmount = seats.length;
    const perSeatFallback = Math.round((weight / seats.length) * 100) / 100;
    optionsSeat = seats.map((s) => ({
      // НП вимагає ≥ 5 см на сторону; піднімаємо мінімум, щоб уникнути відмови.
      volumetricWidth: Math.max(MIN_DIM_CM, s.widthCm),
      volumetricLength: Math.max(MIN_DIM_CM, s.lengthCm),
      volumetricHeight: Math.max(MIN_DIM_CM, s.heightCm),
      weight: Math.max(MIN_WEIGHT_KG, s.weight || perSeatFallback),
      specialCargo: s.manualHandling ?? false,
    }));
  } else {
    weight = Math.max(MIN_WEIGHT_KG, Math.round(itemsWeight * 100) / 100);
    seatsAmount = Math.max(1, sale.items.length);
    optionsSeat = undefined;
  }

  // Опис = загальні назви (унікальні), як у чеку.
  const missingReceipt = sale.items.some(
    (it) => !it.product.receiptName?.trim(),
  );
  let resolver: ReturnType<typeof buildReceiptNameResolver>;
  if (missingReceipt) {
    const categories = await prisma.category.findMany({
      select: { id: true, name: true, parentId: true },
    });
    resolver = buildReceiptNameResolver(categories as CategoryNode[]);
  } else {
    resolver = buildReceiptNameResolver([]);
  }
  const names = new Set<string>();
  for (const it of sale.items) {
    names.add(resolveReceiptName(it.product, resolver).name);
  }
  const description = [...names].join(", ") || "Товари вживані";

  // Оголошена цінність.
  const baseCost = sale.declaredValueEnabled
    ? Math.round(sale.declaredValueUah ?? sale.totalUah)
    : MIN_DECLARED_UAH;
  const cost = Math.max(1, baseCost);

  // Накладка → «Контроль оплати».
  const cod =
    sale.cashOnDelivery && sale.codAmountUah && sale.codAmountUah > 0
      ? Math.round(sale.codAmountUah)
      : undefined;

  const input: CreateTtnInput = {
    payerType: sale.npPayerType === "Sender" ? "Sender" : "Recipient",
    paymentMethod: "Cash",
    cargoType: anyManual ? "Cargo" : "Parcel",
    weight,
    serviceType: "WarehouseWarehouse",
    seatsAmount,
    description,
    cost,
    senderCounterpartyRef: counterparty.ref,
    senderContactRef: contact.ref,
    citySenderRef: senderCityRef,
    senderWarehouseRef,
    senderPhone: senderPhone.replace(/^\+/, ""),
    recipientCounterpartyRef: recipient.counterpartyRef,
    recipientContactRef: recipient.contactRef,
    cityRecipientRef: sale.npCityRef,
    recipientWarehouseRef: sale.npWarehouseRef,
    recipientPhone: npPhone,
    recipientName,
    // Накладка L-TEX = «Контроль оплати» (гроші на рахунок ФОП через NovaPay).
    afterpaymentOnGoodsCost: cod,
    optionsSeat,
  };

  return { kind: "ok", input, ttnRef: sale.ttnRef };
}

async function storeCreatedTtn(
  saleId: string,
  ref: string,
  number: string,
): Promise<void> {
  await prisma.sale.update({
    where: { id: saleId },
    data: {
      ttnRef: ref,
      expressWaybill: number,
      ttnCreatedAt: new Date(),
      ttnError: null,
    },
  });
  // Дописуємо №ТТН у завдання складу (снапшот).
  await prisma.warehouseTask.updateMany({
    where: { saleId },
    data: { expressWaybill: number },
  });
}

/** Фаза 1: авто-створення ТТН при проведенні (fire-and-forget). */
export async function createTtnForSale(saleId: string): Promise<void> {
  try {
    const built = await buildTtnInputForSale(saleId);
    if (built.kind === "skip") return;
    if (built.kind === "error") {
      await setTtnError(saleId, built.message);
      return;
    }
    // Ідемпотентність: ТТН уже створена.
    if (built.ttnRef) return;

    const result = await createInternetDocument(built.input);
    if ("error" in result) {
      await setTtnError(saleId, result.error);
      return;
    }
    await storeCreatedTtn(saleId, result.ref, result.number);
  } catch (err) {
    await setTtnError(
      saleId,
      err instanceof Error ? err.message : "Помилка створення ТТН",
    );
  }
}

/**
 * Фаза 2: оновлює наявну ТТН фактичними місцями/габаритами (склад на «Готово»).
 * Якщо ТТН ще нема — створює одразу з місцями (fallback). Повертає результат,
 * щоб UI показав успіх/помилку.
 */
export async function updateTtnForSale(
  saleId: string,
  seats: SeatDims[],
): Promise<{ ok: boolean; number?: string; error?: string }> {
  try {
    const built = await buildTtnInputForSale(saleId, { seats });
    if (built.kind === "skip") {
      return { ok: false, error: "Реалізація не для Нової Пошти" };
    }
    if (built.kind === "error") {
      await setTtnError(saleId, built.message);
      return { ok: false, error: built.message };
    }

    // ТТН ще нема — створюємо одразу з місцями.
    if (!built.ttnRef) {
      const created = await createInternetDocument(built.input);
      if ("error" in created) {
        await setTtnError(saleId, created.error);
        return { ok: false, error: created.error };
      }
      await storeCreatedTtn(saleId, created.ref, created.number);
      return { ok: true, number: created.number };
    }

    const result = await updateInternetDocument(built.ttnRef, built.input);
    if ("error" in result) {
      await setTtnError(saleId, result.error);
      return { ok: false, error: result.error };
    }
    await prisma.sale.update({
      where: { id: saleId },
      data: { expressWaybill: result.number, ttnError: null },
    });
    await prisma.warehouseTask.updateMany({
      where: { saleId },
      data: { expressWaybill: result.number },
    });
    return { ok: true, number: result.number };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Помилка оновлення ТТН";
    await setTtnError(saleId, message);
    return { ok: false, error: message };
  }
}
