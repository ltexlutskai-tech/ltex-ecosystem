import { prisma } from "@ltex/db";
import { getDeliveryLabelResolver } from "@/lib/manager/delivery-methods";
import { formatDocNumber } from "@/lib/manager/order-number";

/**
 * Блок «Завдання» для складу.
 *
 * При проведенні реалізації («Зберегти та провести») склад отримує детальне
 * завдання: підготувати перелічені лоти до відправлення + перевірити/створити
 * ТТН. Життєвий цикл: `new` → `received` (склад прийняв) → `sent` (запаковано +
 * ТТН, відправлено). На переходах менеджеру (`Sale.assignedAgentUserId` або
 * автор) надсилається сповіщення (`MgrReminder`).
 *
 * Фундамент під інтеграцію з Новою Поштою: спосіб доставки, № відділення та ТТН
 * зберігаються у завданні — пізніше з параметрів картки товару ТТН створюватиметься
 * автоматично.
 */

/**
 * Створює завдання складу для проведеної реалізації. Ідемпотентно: якщо завдання
 * для цієї реалізації вже є — нічого не робить. Best-effort (не кидає назовні).
 */
export async function createWarehouseTaskForSale(
  saleId: string,
): Promise<void> {
  try {
    const existing = await prisma.warehouseTask.findUnique({
      where: { saleId },
      select: { id: true },
    });
    if (existing) return;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: { select: { name: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                articleCode: true,
                packaging: true,
                defaultLengthCm: true,
                defaultWidthCm: true,
                defaultHeightCm: true,
              },
            },
            lot: { select: { barcode: true, sector: true } },
          },
        },
      },
    });
    if (!sale) return;

    // Менеджер для сповіщень — призначений агент або автор (assignedAgentUserId).
    const managerUserId = sale.assignedAgentUserId;
    let managerName: string | null = null;
    if (managerUserId) {
      const u = await prisma.user.findUnique({
        where: { id: managerUserId },
        select: { fullName: true },
      });
      managerName = u?.fullName ?? null;
    }

    const deliveryLabelOf = await getDeliveryLabelResolver();

    await prisma.warehouseTask.create({
      data: {
        saleId: sale.id,
        status: "new",
        customerName: sale.customer.name,
        deliveryMethod: sale.deliveryMethod,
        deliveryLabel: sale.deliveryMethod
          ? deliveryLabelOf(sale.deliveryMethod)
          : null,
        novaPoshtaBranch: sale.novaPoshtaBranch,
        expressWaybill: sale.expressWaybill,
        deliveryAddress: sale.deliveryAddress,
        managerUserId,
        managerName,
        items: {
          create: sale.items.map((it) => ({
            productId: it.product.id,
            productName: it.product.name,
            articleCode: it.product.articleCode,
            barcode: it.barcode ?? it.lot?.barcode ?? null,
            lotId: it.lotId,
            quantity: it.quantity,
            weight: it.weight,
            sector: it.lot?.sector ?? null,
            packaging: it.product.packaging,
            defaultLengthCm: it.product.defaultLengthCm,
            defaultWidthCm: it.product.defaultWidthCm,
            defaultHeightCm: it.product.defaultHeightCm,
          })),
        },
      },
    });
  } catch (err) {
    console.error("[L-TEX] createWarehouseTaskForSale failed", {
      saleId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Сповіщення менеджеру про перехід завдання (склад прийняв / відправлено).
 * Пише `MgrReminder` на `managerUserId` (best-effort). `saleRef` — для номера у
 * тексті. Deep-link у дзвіночку веде на реалізацію.
 */
export async function notifyManagerAboutTask(opts: {
  managerUserId: string | null;
  customerName: string;
  saleRef: {
    number1C: string | null;
    code1C: string | null;
    docNumber: number;
  };
  kind: "received" | "sent";
}): Promise<void> {
  if (!opts.managerUserId) return;
  try {
    const num = formatDocNumber(opts.saleRef);
    const body =
      opts.kind === "received"
        ? `Склад отримав завдання по реалізації ${num} (${opts.customerName}) — готують до відправлення.`
        : `Посилку відправлено: реалізація ${num} (${opts.customerName}) — запаковано, ТТН створено.`;
    await prisma.mgrReminder.create({
      data: {
        ownerUserId: opts.managerUserId,
        body,
        remindAt: new Date(),
        source: "manual",
      },
    });
  } catch (err) {
    console.error("[L-TEX] notifyManagerAboutTask failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
