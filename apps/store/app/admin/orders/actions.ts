"use server";

import { prisma } from "@ltex/db";
import { ORDER_STATUSES, type OrderStatus } from "@ltex/shared";
import { revalidatePath } from "next/cache";
import { sendPushNotification } from "@/lib/push";
import { sendOrderStatusEmail } from "@/lib/email";
import { requireAdmin } from "@/lib/admin-auth";

const STATUS_LABELS: Record<string, string> = {
  pending: "Очікує",
  confirmed: "Підтверджено",
  processing: "В обробці",
  shipped: "Відправлено",
  delivered: "Доставлено",
  cancelled: "Скасовано",
};

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  await requireAdmin();
  if (!ORDER_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status },
    select: {
      id: true,
      code1C: true,
      customerId: true,
      totalEur: true,
      customer: { select: { name: true, email: true } },
    },
  });

  const statusLabel = STATUS_LABELS[status] ?? status;
  const orderRef = order.code1C ?? order.id.slice(0, 8);

  // Send push notification to customer about status change
  if (order.customerId) {
    sendPushNotification(
      order.customerId,
      "Статус замовлення оновлено",
      `Замовлення ${orderRef}: ${statusLabel}`,
      { type: "order_status", orderId: order.id, status },
    ).catch(() => {
      // Non-blocking — don't fail status update for push errors
    });
  }

  // Send status update email to customer
  if (order.customer?.email) {
    sendOrderStatusEmail({
      orderId: order.id,
      customerName: order.customer.name,
      customerEmail: order.customer.email,
      status,
      statusLabel,
      orderRef,
    }).catch(() => {});
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin");
}

export async function addOrderNote(orderId: string, notes: string) {
  await requireAdmin();

  await prisma.order.update({
    where: { id: orderId },
    data: { notes },
  });

  revalidatePath("/admin/orders");
}
