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
  ensureRecipientPrivatePerson,
  getSenderCounterparty,
  getSenderContact,
  type CreateTtnInput,
} from "@/lib/delivery/nova-poshta";

/**
 * Фаза 1 — авто-створення ТТН Нової Пошти при проведенні реалізації.
 *
 * Викликається fire-and-forget одразу після `createWarehouseTaskForSale`
 * (у `sale-create.ts`), тому завдання складу вже існує і ми дописуємо йому №ТТН.
 *
 * Правила (рішення user):
 *  - ТТН створюється для ВСІХ відправлень Новою Поштою (трекінг усім; накладка —
 *    тим паче). Тільки `deliveryKind === "post"`.
 *  - Місця/вага орієнтовні (вага = сума ваг рядків, місць = к-сть рядків);
 *    склад фіналізує габарити/місця у Фазі 2 (`updateInternetDocument`).
 *  - Отримувач — приватна особа (ПІБ+телефон з реалізації, префіл з картки клієнта).
 *  - Платник доставки — з `Sale.npPayerType` (дефолт «отримувач»).
 *  - Накладка (`cashOnDelivery`) → BackwardDeliveryData Money = `codAmountUah`.
 *  - Оголошена цінність = сума реалізації (₴), або мінімальна, якщо вимкнено.
 *
 * Best-effort: НЕ кидає. Помилку пишемо у `Sale.ttnError` (UI показує «Повторити»).
 * Ідемпотентно: якщо `Sale.ttnRef` уже є — виходимо.
 */

const MIN_DECLARED_UAH = 300;
const MIN_WEIGHT_KG = 0.1;

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

export async function createTtnForSale(saleId: string): Promise<void> {
  try {
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
    if (!sale) return;
    // Ідемпотентність: ТТН уже створена.
    if (sale.ttnRef) return;

    // Лише Нова Пошта.
    const labelResolver = await getDeliveryLabelResolver();
    const kind = classifyDelivery(
      sale.deliveryMethod,
      sale.deliveryMethod ? labelResolver(sale.deliveryMethod) : null,
    );
    if (kind !== "post") return;

    // Відділення-отримувач обовʼязкове (Phase 1 — лише відділення-відділення).
    if (!sale.npCityRef || !sale.npWarehouseRef) {
      await setTtnError(
        saleId,
        "Оберіть місто й відділення Нової Пошти у реалізації, потім «Повторити».",
      );
      return;
    }

    // Отримувач: ПІБ + телефон.
    const recipientName = (sale.npRecipientName ?? sale.customer.name).trim();
    const recipientPhone = normalizePhone(sale.npRecipientPhone);
    if (!recipientName) {
      await setTtnError(saleId, "Вкажіть ПІБ отримувача у реалізації.");
      return;
    }
    if (!recipientPhone) {
      await setTtnError(saleId, "Вкажіть коректний телефон отримувача.");
      return;
    }

    // Відправник (з env + кешований контрагент/контакт NP).
    const senderCityRef = process.env.NP_SENDER_CITY_REF;
    const senderWarehouseRef = process.env.NP_SENDER_WAREHOUSE_REF;
    const senderPhone = process.env.NP_SENDER_PHONE;
    if (!senderCityRef || !senderWarehouseRef || !senderPhone) {
      await setTtnError(
        saleId,
        "Не налаштовано відправника НП (NP_SENDER_* у .env).",
      );
      return;
    }
    const counterparty = await getSenderCounterparty();
    if (!counterparty) {
      await setTtnError(
        saleId,
        "Не вдалося отримати контрагента-відправника НП (перевірте ключ API).",
      );
      return;
    }
    const contact = await getSenderContact(counterparty.ref);
    if (!contact) {
      await setTtnError(saleId, "Не вдалося отримати контакт відправника НП.");
      return;
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
      await setTtnError(saleId, `Отримувач: ${recipient.error}`);
      return;
    }

    // Вага/місця (орієнтовні; склад фіналізує у Фазі 2).
    const totalWeight = sale.items.reduce(
      (sum, it) => sum + (it.weight || 0),
      0,
    );
    const weight = Math.max(MIN_WEIGHT_KG, Math.round(totalWeight * 100) / 100);
    const seatsAmount = Math.max(1, sale.items.length);

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

    // Накладка (COD).
    const cod =
      sale.cashOnDelivery && sale.codAmountUah && sale.codAmountUah > 0
        ? Math.round(sale.codAmountUah)
        : undefined;

    const input: CreateTtnInput = {
      payerType: sale.npPayerType === "Sender" ? "Sender" : "Recipient",
      paymentMethod: "Cash",
      cargoType: "Parcel",
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
      backwardDeliveryCod: cod,
    };

    const result = await createInternetDocument(input);
    if ("error" in result) {
      await setTtnError(saleId, result.error);
      return;
    }

    await prisma.sale.update({
      where: { id: saleId },
      data: {
        ttnRef: result.ref,
        expressWaybill: result.number,
        ttnCreatedAt: new Date(),
        ttnError: null,
      },
    });
    // Дописуємо №ТТН у завдання складу (снапшот).
    await prisma.warehouseTask.updateMany({
      where: { saleId },
      data: { expressWaybill: result.number },
    });
  } catch (err) {
    await setTtnError(
      saleId,
      err instanceof Error ? err.message : "Помилка створення ТТН",
    );
  }
}
