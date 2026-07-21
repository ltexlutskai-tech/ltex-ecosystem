import { prisma } from "@ltex/db";
import { normalizePhone } from "@ltex/shared";
import { classifyDelivery } from "@/lib/manager/order-delivery";
import { getDeliveryLabelResolver } from "@/lib/manager/delivery-methods";
import { getPaymentSummary } from "@/lib/manager/payment-summary";
import {
  buildReceiptNameResolver,
  resolveReceiptName,
  type CategoryNode,
} from "@/lib/manager/receipt-name";
import {
  createInternetDocument,
  updateInternetDocument,
  ensureRecipientPrivatePerson,
  saveRecipientAddress,
  getSenderCounterparty,
  getSenderContact,
  getTtnStatus,
  deleteInternetDocument,
  type CreateTtnInput,
  type CreateTtnResult,
  type NpSeatOption,
} from "@/lib/delivery/nova-poshta";

/** Чи містить запит спецвантаж/РО (для авто-відкату при відмові НП). */
function hasSpecialCargo(input: CreateTtnInput): boolean {
  return (
    input.cargoType === "Cargo" ||
    (input.optionsSeat?.some((s) => s.specialCargo) ?? false)
  );
}

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
  opts?: { seats?: SeatDims[]; disableSpecialCargo?: boolean },
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

  // Тип доставки НП: «до дверей» (кур'єр на адресу) чи «на відділення» (дефолт).
  const isDoors = sale.npDeliveryType === "WarehouseDoors";
  if (isDoors) {
    if (!sale.npCityRef || !sale.npStreetRef || !sale.npBuildingNumber) {
      return {
        kind: "error",
        message:
          "Для доставки кур'єром вкажіть місто, вулицю та будинок Нової Пошти.",
      };
    }
  } else if (!sale.npCityRef || !sale.npWarehouseRef) {
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

  // Адресна доставка «до дверей»: створюємо адресу отримувача (вулиця/будинок/
  // квартира) → її ref піде у ТТН як RecipientAddress (ServiceType=WarehouseDoors).
  let recipientAddressRef: string;
  if (isDoors) {
    const saved = await saveRecipientAddress({
      counterpartyRef: recipient.counterpartyRef,
      streetRef: sale.npStreetRef!,
      building: sale.npBuildingNumber!,
      flat: sale.npFlat ?? undefined,
    });
    if ("error" in saved) {
      return { kind: "error", message: `Адреса: ${saved.error}` };
    }
    recipientAddressRef = saved.ref;
  } else {
    recipientAddressRef = sale.npWarehouseRef!;
  }

  // Вага/місця: фактичні складські місця (Фаза 2), інакше орієнтовні.
  const seats = (opts?.seats ?? []).filter(
    (s) => s.weight > 0 || s.lengthCm > 0 || s.widthCm > 0 || s.heightCm > 0,
  );
  const itemsWeight = sale.items.reduce((sum, it) => sum + (it.weight || 0), 0);
  let weight: number;
  let seatsAmount: number;
  let optionsSeat: NpSeatOption[] | undefined;
  // «Ручна обробка» хоч на одному місці → CargoType=Cargo. Але НП часто відхиляє
  // спецвантаж через API (маршрутизація й так на явно вказане відділення), тому
  // є відкат: disableSpecialCargo вимикає РО й повертає звичайну посилку.
  const useManual = !opts?.disableSpecialCargo;
  const anyManual = useManual && seats.some((s) => s.manualHandling);
  if (seats.length > 0) {
    seatsAmount = seats.length;
    const round2 = (n: number): number => Math.round(n * 100) / 100;
    const rawSum = seats.reduce((s, x) => s + (x.weight || 0), 0);
    const perSeatFallback = round2((rawSum || itemsWeight) / seats.length);
    optionsSeat = seats.map((s) => {
      const manual = useManual && (s.manualHandling ?? false);
      return {
        // НП вимагає ≥ 5 см на сторону; піднімаємо мінімум.
        volumetricWidth: Math.max(MIN_DIM_CM, s.widthCm),
        volumetricLength: Math.max(MIN_DIM_CM, s.lengthCm),
        volumetricHeight: Math.max(MIN_DIM_CM, s.heightCm),
        // Спецвантаж (РО) — НП вимагає ЦІЛІ кг на місце; звичайні — до сотих.
        weight: manual
          ? Math.max(1, Math.round(s.weight || perSeatFallback))
          : Math.max(MIN_WEIGHT_KG, round2(s.weight) || perSeatFallback),
        specialCargo: manual,
      };
    });
    // Вага документа = ТОЧНА сума ваг місць (щоб НП не бачив розбіжності —
    // «Special Cargo seat not match in weight»); ті самі round2-значення.
    weight = Math.max(
      MIN_WEIGHT_KG,
      round2(optionsSeat.reduce((a, s) => a + s.weight, 0)),
    );
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

  // Накладка → «Контроль оплати». Береться ЗАЛИШОК до сплати з урахуванням
  // передоплат (свіже зведення по касі), а не збережене `codAmountUah`, яке
  // могло бути пораховане до внесення передоплати. Так наложка = сума − оплачено.
  let cod: number | undefined;
  if (sale.cashOnDelivery) {
    const summary = await getPaymentSummary(sale.id);
    const remainUah = summary ? summary.codAmountUah : (sale.codAmountUah ?? 0);
    cod = remainUah > 0 ? Math.round(remainUah) : undefined;
  }

  const input: CreateTtnInput = {
    payerType: sale.npPayerType === "Sender" ? "Sender" : "Recipient",
    paymentMethod: "Cash",
    cargoType: anyManual ? "Cargo" : "Parcel",
    weight,
    serviceType: isDoors ? "WarehouseDoors" : "WarehouseWarehouse",
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
    // Для «до дверей» — ref створеної адреси; для «на відділення» — ref відділення.
    recipientWarehouseRef: recipientAddressRef,
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
): Promise<{ ok: boolean; number?: string; error?: string; note?: string }> {
  try {
    const built = await buildTtnInputForSale(saleId, { seats });
    if (built.kind === "skip") {
      return { ok: false, error: "Реалізація не для Нової Пошти" };
    }
    if (built.kind === "error") {
      await setTtnError(saleId, built.message);
      return { ok: false, error: built.message };
    }
    const hadSpecial = hasSpecialCargo(built.input);

    // Виконує create/update; якщо НП відхилив РО-запит — повторює без РО
    // (посилка все одно їде на явно обране відділення).
    const send = async (
      input: CreateTtnInput,
    ): Promise<
      | { ok: true; number: string; ref: string; roDropped: boolean }
      | { error: string }
    > => {
      const call = async (
        i: CreateTtnInput,
      ): Promise<CreateTtnResult | { error: string }> =>
        built.ttnRef
          ? updateInternetDocument(built.ttnRef, i)
          : createInternetDocument(i);

      let res = await call(input);
      let roDropped = false;
      if ("error" in res && hadSpecial) {
        const noRo = await buildTtnInputForSale(saleId, {
          seats,
          disableSpecialCargo: true,
        });
        if (noRo.kind === "ok") {
          const res2 = await call(noRo.input);
          if (!("error" in res2)) {
            res = res2;
            roDropped = true;
          } else {
            res = res2;
          }
        }
      }
      if ("error" in res) return { error: res.error };
      return { ok: true, number: res.number, ref: res.ref, roDropped };
    };

    const sent = await send(built.input);
    if ("error" in sent) {
      await setTtnError(saleId, sent.error);
      return { ok: false, error: sent.error };
    }
    if (built.ttnRef) {
      await prisma.sale.update({
        where: { id: saleId },
        data: { expressWaybill: sent.number, ttnError: null },
      });
      await prisma.warehouseTask.updateMany({
        where: { saleId },
        data: { expressWaybill: sent.number },
      });
    } else {
      await storeCreatedTtn(saleId, sent.ref, sent.number);
    }
    return {
      ok: true,
      number: sent.number,
      note: sent.roDropped
        ? "Нова Пошта не прийняла ручну обробку — ТТН створено без РО (посилка все одно їде на обране відділення)."
        : undefined,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Помилка оновлення ТТН";
    await setTtnError(saleId, message);
    return { ok: false, error: message };
  }
}

/**
 * Стан очищення ТТН НП при видаленні реалізації.
 *  • "no-ttn"     — ТТН не створювалась;
 *  • "deleted"    — чернетку ТТН видалено в НП;
 *  • "in-transit" — ТТН уже в дорозі (не чернетка) → НЕ чіпаємо;
 *  • "error"      — НП відхилив видалення (передаємо текст).
 */
export interface DeleteNpTtnResult {
  state: "no-ttn" | "deleted" | "in-transit" | "error";
  error?: string;
}

/**
 * Видаляє ЧЕРНЕТКУ ТТН НП, привʼязану до реалізації (при видаленні документа).
 * Best-effort: НЕ кидає. Якщо ТТН уже в дорозі — повертає "in-transit" (рішення
 * блокувати/пропускати лишає викликач). Якщо НП недоступний — пробує видалити
 * (чернетку все одно безпечно прибрати).
 */
export async function deleteNpTtnForSale(
  ttnRef: string | null | undefined,
  expressWaybill: string | null | undefined,
): Promise<DeleteNpTtnResult> {
  if (!ttnRef || !expressWaybill) return { state: "no-ttn" };
  try {
    const status = await getTtnStatus(expressWaybill);
    if (status && !status.isDraft) return { state: "in-transit" };
  } catch {
    // НП недоступний — пробуємо видалити чернетку далі (best-effort).
  }
  const del = await deleteInternetDocument(ttnRef);
  if (!del.success) return { state: "error", error: del.error };
  return { state: "deleted" };
}
