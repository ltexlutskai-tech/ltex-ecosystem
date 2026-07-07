import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canDeleteManagerDoc } from "@/lib/manager/doc-delete-permission";
import { canViewOrder } from "@/lib/manager/order-ownership";
import {
  canEditOrder,
  isOrderLocked,
  isTransitionAllowed,
} from "@/lib/manager/order-status";
import {
  findOtherActiveOrder,
  canForceActive,
} from "@/lib/manager/order-active-guard";
import { formatOrderNumber } from "@/lib/manager/order-number";
import { updateOrderSchema } from "@/lib/validations/manager-order";
import { updateOrderWithItems } from "@/lib/manager/order-create";
import { completeSiteOrderReminders } from "@/lib/manager/site-order-reminders";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const ok = await canViewOrder(user, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Замовлення не знайдено" },
      { status: 404 },
    );
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: {
        select: { id: true, name: true, code1C: true, phone: true, city: true },
      },
      items: {
        include: {
          product: { select: { id: true, name: true, slug: true } },
          lot: { select: { id: true, barcode: true } },
        },
      },
      shipments: true,
      payments: true,
    },
  });
  if (!order) {
    return NextResponse.json(
      { error: "Замовлення не знайдено" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    order: {
      id: order.id,
      code1C: order.code1C,
      status: order.status,
      totalEur: order.totalEur,
      totalUah: order.totalUah,
      exchangeRate: order.exchangeRate,
      notes: order.notes,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      customer: order.customer,
      items: order.items.map((i) => ({
        id: i.id,
        weight: i.weight,
        quantity: i.quantity,
        priceEur: i.priceEur,
        product: i.product,
        lot: i.lot,
      })),
      shipments: order.shipments,
      payments: order.payments,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  // Ownership: manager — лише свої замовлення; admin — будь-яке.
  const ok = await canViewOrder(user, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Замовлення не знайдено" },
      { status: 404 },
    );
  }

  const existing = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      version: true,
      updatedAt: true,
      closedAt: true,
      archived: true,
      isActual: true,
      customerId: true,
    },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Замовлення не знайдено" },
      { status: 404 },
    );
  }

  // Закрите замовлення — не редагувати.
  if (existing.closedAt) {
    return NextResponse.json(
      { error: "Замовлення закрите — редагування заборонено" },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);

  // ─── Вузьке перемикання «Актуальне» (7.3) ────────────────────────────────
  // Тіло рівно `{ isActual: boolean }` (кнопка-перемикач на картці/у списку).
  // Обробляється окремо від повного редагування — працює й для проведених.
  const actualOnly = z
    .object({ isActual: z.boolean() })
    .strict()
    .safeParse(body);
  if (actualOnly.success) {
    const next = actualOnly.data.isActual;
    if (next === true) {
      if (existing.archived) {
        return NextResponse.json(
          { error: "Архівне замовлення не може бути актуальним" },
          { status: 400 },
        );
      }
      // Guard «одне активне на клієнта»: не можна мати 2 актуальні.
      const other = await findOtherActiveOrder(existing.customerId, id);
      const force = req.nextUrl.searchParams.get("force") === "true";
      if (other && !force) {
        return NextResponse.json(
          {
            code: "active_order_exists",
            existingOrderId: other.id,
            existingOrderNumber: formatOrderNumber(other),
          },
          { status: 409 },
        );
      }
      if (other && force && !canForceActive(user.role)) {
        return NextResponse.json(
          {
            error:
              "Лише адмін/власник може мати два активні замовлення на клієнта",
          },
          { status: 403 },
        );
      }
      const updated = await prisma.$transaction(async (tx) => {
        if (other && force) {
          await tx.order.update({
            where: { id: other.id },
            data: { isActual: false },
          });
        }
        return tx.order.update({
          where: { id },
          data: { isActual: true, version: { increment: 1 } },
          select: { id: true, status: true, isActual: true, version: true },
        });
      });
      revalidatePath("/manager/orders");
      return NextResponse.json(updated);
    }
    // Зняти «Актуальне» — завжди дозволено.
    const updated = await prisma.order.update({
      where: { id },
      data: { isActual: false, version: { increment: 1 } },
      select: { id: true, status: true, isActual: true, version: true },
    });
    revalidatePath("/manager/orders");
    return NextResponse.json(updated);
  }

  // ─── Повне редагування (форма) ───────────────────────────────────────────
  // Проведене редагується лише поки «Актуальне»; скасоване — ні (7.3).
  if (!canEditOrder(existing.status, existing.isActual)) {
    return NextResponse.json(
      {
        error: isOrderLocked(existing.status)
          ? "Замовлення проведено і не актуальне — поверніть «Актуальне», щоб редагувати"
          : "Скасоване замовлення не редагується",
      },
      { status: 409 },
    );
  }

  const parsed = updateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // ─── Optimistic lock (Етап 4 блоку Замовлення) ───────────────────────────
  // Клієнт надсилає `version` яку бачив. Якщо у БД більша → 409 з підказкою
  // перезавантажити. Якщо version не передано — пропускаємо перевірку
  // (backward-compat зі старими API-клієнтами).
  if (typeof input.version === "number" && input.version !== existing.version) {
    return NextResponse.json(
      {
        error:
          "Замовлення було змінено іншим користувачем. Перезавантажте сторінку.",
        code: "version_conflict",
        currentVersion: existing.version,
      },
      { status: 409 },
    );
  }

  // Якщо змінюється статус — перевіряємо дозволеність переходу.
  // Кнопка «Зберегти та провести» (`post=true`) ⇒ перехід у `posted`.
  let nextStatus: string | undefined;
  const requestedStatus = input.post ? "posted" : input.status;
  if (requestedStatus && requestedStatus !== existing.status) {
    if (!isTransitionAllowed(existing.status, requestedStatus)) {
      return NextResponse.json(
        {
          error: `Перехід «${existing.status}» → «${requestedStatus}» не дозволено`,
        },
        { status: 409 },
      );
    }
    nextStatus = requestedStatus;
  }

  // Guard: не можна позначити закрите/архівне замовлення як актуальне.
  if (input.isActual === true && (existing.closedAt || existing.archived)) {
    return NextResponse.json(
      {
        error: "Закрите або архівне замовлення не може бути актуальним",
      },
      { status: 400 },
    );
  }

  try {
    const order = await updateOrderWithItems(
      id,
      input,
      { userId: user.id },
      { nextStatus },
    );
    // Сайтове замовлення оброблене (проведене/скасоване) → закриваємо
    // авто-нагадування «обробити сайтове замовлення» (7.2 Блок 1).
    if (nextStatus === "posted" || nextStatus === "cancelled") {
      await completeSiteOrderReminders(id);
    }
    return NextResponse.json({
      id: order.id,
      code1C: order.code1C,
      status: order.status,
      isActual: order.isActual,
      totalEur: order.totalEur,
      totalUah: order.totalUah,
      exchangeRate: order.exchangeRate,
      notes: order.notes,
      priceTypeId: order.priceTypeId,
      deliveryMethod: order.deliveryMethod,
      cashOnDelivery: order.cashOnDelivery,
      assignedAgentUserId: order.assignedAgentUserId,
      exportTo1C: order.exportTo1C,
      updatedAt: order.updatedAt.toISOString(),
      customer: order.customer,
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        lotId: i.lotId,
        priceEur: i.priceEur,
        weight: i.weight,
        quantity: i.quantity,
      })),
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003" || err.code === "P2025") {
        return NextResponse.json(
          { error: "Невалідний product/lot у items" },
          { status: 400 },
        );
      }
    }
    console.error("[L-TEX] Order update failed", {
      orderId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка оновлення замовлення" },
      { status: 500 },
    );
  }
}

/**
 * Видалення замовлення (з контекстного меню списку).
 *
 * Ownership — як у GET/PATCH (`canViewOrder`): менеджер видаляє лише свої, admin —
 * будь-яке. Працює і для проведених (`posted`/`archived`) замовлень.
 *
 * Реверс сліду документа:
 *   - `OrderItem` / `Shipment` / `Payment` видаляються каскадом (`onDelete: Cascade`);
 *   - `Sale.orderId` обнуляється автоматично (`onDelete: SetNull`) — реалізації-
 *     підстави зберігаються, лише відв'язуються.
 *   - Замовлення НЕ пишуть рухів боргу, тому перерахунок боргу не потрібен.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  if (!canDeleteManagerDoc(user.role)) {
    return NextResponse.json(
      { error: "Недостатньо прав для видалення" },
      { status: 403 },
    );
  }

  const { id } = await params;

  const ok = await canViewOrder(user, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Замовлення не знайдено" },
      { status: 404 },
    );
  }

  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Замовлення не знайдено" },
      { status: 404 },
    );
  }

  try {
    await prisma.order.delete({ where: { id } });
    revalidatePath("/manager/orders");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[L-TEX] Order delete failed", {
      orderId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка видалення замовлення" },
      { status: 500 },
    );
  }
}
