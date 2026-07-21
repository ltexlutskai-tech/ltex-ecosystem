import { prisma } from "@ltex/db";
import { getPlatformSender } from "@/lib/chat/platform-send";
import { matchClientByPhone } from "@/lib/chat/phone-match";
import { formatDocNumber } from "@/lib/manager/order-number";

/**
 * Дані для формування тексту сповіщення покупцю про відправлення.
 */
export interface ShipmentMsgInput {
  docNumber: number;
  number1C: string | null;
  code1C: string | null;
  expressWaybill: string | null; // № ТТН Нової Пошти
  cashOnDelivery: boolean;
  codAmountUah: number | null;
  npCityName: string | null;
  npWarehouseName: string | null;
}

/**
 * Чистий будівник тексту повідомлення покупцю.
 *
 * Якщо є № ТТН НП — «відправлено» + реквізити НП + трек-лінк. Якщо ТТН немає —
 * «готове до відправлення» (без реквізитів НП). Наложка додається окремим
 * рядком, коли сума > 0. Порожні рядки відкидаються.
 */
export function buildShipmentMessage(i: ShipmentMsgInput): string {
  const orderNo = formatDocNumber({
    number1C: i.number1C,
    code1C: i.code1C,
    docNumber: i.docNumber,
  });

  const lines: string[] = [];
  const hasTtn = Boolean(i.expressWaybill && i.expressWaybill.trim());

  if (hasTtn) {
    lines.push(`Вітаємо! Ваше замовлення ${orderNo} відправлено 📦`);
    lines.push(`Нова Пошта, ТТН: ${i.expressWaybill}`);
    if (i.npCityName || i.npWarehouseName) {
      lines.push([i.npCityName, i.npWarehouseName].filter(Boolean).join(", "));
    }
    lines.push(
      `Відстежити: https://novaposhta.ua/tracking/?cargo_number=${i.expressWaybill}`,
    );
  } else {
    lines.push(`Ваше замовлення ${orderNo} готове до відправлення 📦`);
  }

  if (i.cashOnDelivery && i.codAmountUah && i.codAmountUah > 0) {
    lines.push(
      `Накладений платіж: ${i.codAmountUah} грн (оплата при отриманні).`,
    );
  }

  return lines.filter(Boolean).join("\n");
}

/**
 * Best-effort: сповіщає ПОКУПЦЯ про відправлення замовлення — але ЛИШЕ через
 * бот-розмову, яку клієнт сам розпочав (правило: бот пише тільки тим, хто нам
 * написав першим). Додатково пише in-app Notification та Shipment-трек-рядок.
 *
 * НІКОЛИ не кидає виняток (обгорнуто в try/catch) — виклик fire-and-forget зі
 * складського «Готово».
 */
export async function notifyCustomerShipmentSent(
  saleId: string,
): Promise<{ ok: boolean; sent: number; error?: string }> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        docNumber: true,
        number1C: true,
        code1C: true,
        expressWaybill: true,
        cashOnDelivery: true,
        codAmountUah: true,
        npCityName: true,
        npWarehouseName: true,
        npRecipientPhone: true,
        orderId: true,
        customer: {
          select: { id: true, name: true, phone: true, code1C: true },
        },
      },
    });
    if (!sale) {
      return { ok: false, sent: 0, error: "Реалізацію не знайдено" };
    }

    const text = buildShipmentMessage({
      docNumber: sale.docNumber,
      number1C: sale.number1C,
      code1C: sale.code1C,
      expressWaybill: sale.expressWaybill,
      cashOnDelivery: sale.cashOnDelivery,
      codAmountUah: sale.codAmountUah,
      npCityName: sale.npCityName,
      npWarehouseName: sale.npWarehouseName,
    });

    // Резолв клієнта за телефоном (отримувач ТТН має пріоритет над клієнтом).
    const phone = sale.npRecipientPhone ?? sale.customer.phone;
    const match = phone ? await matchClientByPhone(phone) : null;

    // Шукаємо активні бот-розмови цього клієнта (за MgrClient.id або code1C).
    const orClauses = [
      match?.clientId ? { clientId: match.clientId } : undefined,
      sale.customer.code1C
        ? { client: { code1C: sale.customer.code1C } }
        : undefined,
    ].filter(Boolean) as { clientId?: string; client?: { code1C: string } }[];

    let sent = 0;
    if (orClauses.length > 0) {
      const conversations = await prisma.chatConversation.findMany({
        where: { status: "active", OR: orClauses },
        select: { platform: true, externalUserId: true },
      });
      for (const c of conversations) {
        // send() best-effort — не кидає; рахуємо як надіслане.
        await getPlatformSender(c.platform).send(c.externalUserId, text);
        sent += 1;
      }
    }

    // In-app сповіщення (best-effort — не втрачаємо решту при збої).
    try {
      await prisma.notification.create({
        data: {
          customerId: sale.customer.id,
          type: "order_status",
          title: "Замовлення відправлено",
          body: text,
          payload: { saleId: sale.id, ttn: sale.expressWaybill },
        },
      });
    } catch (error) {
      console.warn("[L-TEX] notifyCustomerShipmentSent: notification failed", {
        saleId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Трек-рядок Shipment (тільки коли є замовлення + ТТН). Свій try/catch —
    // збій тут не має скасовувати сповіщення.
    if (sale.orderId && sale.expressWaybill) {
      try {
        await prisma.shipment.upsert({
          where: {
            orderId_trackingNumber: {
              orderId: sale.orderId,
              trackingNumber: sale.expressWaybill,
            },
          },
          create: {
            orderId: sale.orderId,
            trackingNumber: sale.expressWaybill,
            carrier: "nova_poshta",
            status: "sent",
            statusText: "Відправлено",
            recipientCity: sale.npCityName,
            recipientBranch: sale.npWarehouseName,
          },
          update: {
            status: "sent",
            statusText: "Відправлено",
            recipientCity: sale.npCityName,
            recipientBranch: sale.npWarehouseName,
          },
        });
      } catch (error) {
        console.warn("[L-TEX] notifyCustomerShipmentSent: shipment failed", {
          saleId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { ok: true, sent };
  } catch (error) {
    return {
      ok: false,
      sent: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
