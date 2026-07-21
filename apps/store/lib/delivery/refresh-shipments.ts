import { prisma } from "@ltex/db";
import { trackTtnMany } from "./nova-poshta";
import { classifyShipmentUpdate } from "./np-status";

/**
 * Фонове оновлення статусів відправлень Нової Пошти.
 *
 * Бере активні (не термінальні) відправлення НП, пакетно тягне статуси з НП
 * (getStatusDocuments, до 100/виклик), оновлює `Shipment` (status/statusText/
 * estimatedDate/lastCheckedAt) і на переході в «отримано» створює клієнту
 * сповіщення (`Notification`). Best-effort; запускається кроном.
 */

// Термінальні коди НП — не перевіряємо (отримано/повернення/відмова).
const TERMINAL_CODES = ["9", "10", "11", "106", "2", "102", "103", "105"];

export interface RefreshShipmentsResult {
  checked: number;
  updated: number;
  delivered: number;
}

export async function refreshNpShipments(
  limit = 100,
): Promise<RefreshShipmentsResult> {
  const shipments = await prisma.shipment.findMany({
    where: {
      carrier: "nova_poshta",
      status: { notIn: TERMINAL_CODES },
    },
    orderBy: [{ lastCheckedAt: "asc" }],
    take: limit,
    select: {
      id: true,
      trackingNumber: true,
      status: true,
      statusText: true,
      order: { select: { customerId: true } },
    },
  });
  if (shipments.length === 0) return { checked: 0, updated: 0, delivered: 0 };

  const map = await trackTtnMany(shipments.map((s) => s.trackingNumber));
  const now = new Date();
  let updated = 0;
  let delivered = 0;

  for (const s of shipments) {
    const tracking = map.get(s.trackingNumber);
    if (!tracking) {
      // НП не повернув статус (ще не в системі) — лише позначаємо перевірку.
      await prisma.shipment
        .update({ where: { id: s.id }, data: { lastCheckedAt: now } })
        .catch(() => undefined);
      continue;
    }
    const u = classifyShipmentUpdate(
      { status: s.status, statusText: s.statusText },
      tracking,
    );
    await prisma.shipment
      .update({
        where: { id: s.id },
        data: {
          status: u.status,
          statusText: u.statusText,
          lastCheckedAt: now,
          ...(u.estimatedDate
            ? { estimatedDate: new Date(u.estimatedDate) }
            : {}),
        },
      })
      .catch(() => undefined);
    if (u.changed) updated++;
    if (u.becameDelivered) {
      delivered++;
      if (s.order?.customerId) {
        await prisma.notification
          .create({
            data: {
              customerId: s.order.customerId,
              type: "order_status",
              title: "Замовлення отримано",
              body: `Ваше відправлення ${s.trackingNumber} отримано. Дякуємо за покупку!`,
              payload: { ttn: s.trackingNumber },
            },
          })
          .catch(() => undefined);
      }
    }
  }

  return { checked: shipments.length, updated, delivered };
}
