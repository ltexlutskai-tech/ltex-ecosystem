import { prisma } from "@ltex/db";
import { getCurrentRate } from "@/lib/exchange-rate";
import { enqueueOrderCreate } from "@/lib/sync/enqueue";
import type { CreateOrderInputRaw } from "@/lib/validations/manager-order";

export interface CreateOrderCustomer {
  id: string;
  code1C: string | null;
  name: string;
}

export interface CreateOrderActor {
  /** id поточного менеджера — дефолт для assignedAgentUserId. */
  userId: string;
}

/**
 * Створює Order + items атомарно у `prisma.$transaction`. Розраховує
 * `totalEur = sum(items.priceEur)` та `totalUah = totalEur * rate`
 * (rate — input.exchangeRate якщо передано, інакше `getCurrentRate()`).
 *
 * Менеджерські поля (Етап 1): priceTypeId / deliveryMethod / cashOnDelivery /
 * assignedAgentUserId (дефолт — поточний менеджер) / exportTo1C.
 *
 * Після успіху — **fire-and-forget** enqueue до 1С (M1.5 sync pattern).
 * Якщо enqueue падає — order вже existing, користувач бачить успіх.
 * Той самий best-effort pattern як PATCH /clients/[id] з M1.5.
 */
export async function createOrderWithItems(
  input: CreateOrderInputRaw,
  customer: CreateOrderCustomer,
  actor: CreateOrderActor,
) {
  const rate = input.exchangeRate ?? (await getCurrentRate());
  const totalEur = input.items.reduce((sum, i) => sum + i.priceEur, 0);
  const totalUah = totalEur * rate;

  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      status: "draft",
      totalEur,
      totalUah,
      exchangeRate: rate,
      notes: input.notes,
      priceTypeId: input.priceTypeId ?? null,
      deliveryMethod: input.deliveryMethod ?? null,
      cashOnDelivery: input.cashOnDelivery ?? false,
      assignedAgentUserId: input.assignedAgentUserId ?? actor.userId,
      exportTo1C: input.exportTo1C ?? true,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          lotId: item.lotId ?? null,
          priceEur: item.priceEur,
          weight: item.weight,
          quantity: item.quantity ?? 1,
        })),
      },
    },
    include: {
      items: {
        include: {
          product: { select: { code1C: true } },
          lot: { select: { barcode: true } },
        },
      },
      customer: { select: { id: true, code1C: true, name: true } },
    },
  });

  enqueueOrderCreate({
    id: order.id,
    code1C: order.code1C,
    status: order.status,
    totalEur: order.totalEur,
    totalUah: order.totalUah,
    exchangeRate: order.exchangeRate,
    notes: order.notes,
    customer: { code1C: order.customer.code1C },
    items: order.items.map((i) => ({
      productId: i.productId,
      lotId: i.lotId,
      priceEur: i.priceEur,
      weight: i.weight,
      quantity: i.quantity,
      product: i.product ? { code1C: i.product.code1C } : null,
      lot: i.lot ? { barcode: i.lot.barcode } : null,
    })),
  }).catch((e: unknown) => {
    console.warn("[L-TEX] Failed to enqueue order sync", {
      orderId: order.id,
      error: e instanceof Error ? e.message : String(e),
    });
  });

  return order;
}
