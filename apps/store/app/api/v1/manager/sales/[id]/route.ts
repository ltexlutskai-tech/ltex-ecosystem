import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canDeleteManagerDoc } from "@/lib/manager/doc-delete-permission";
import { canViewSale } from "@/lib/manager/sale-ownership";
import {
  isSaleLocked,
  isSaleTransitionAllowed,
} from "@/lib/manager/sale-status";
import { updateSaleSchema } from "@/lib/validations/manager-sale";
import { updateSaleWithItems } from "@/lib/manager/sale-create";
import {
  recomputeDebtForClients,
  resolveClientIdByCustomer,
} from "@/lib/manager/debt-register";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const ok = await canViewSale(user, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  const sale = await prisma.sale.findUnique({
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
    },
  });
  if (!sale) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    sale: {
      id: sale.id,
      code1C: sale.code1C,
      docNumber: sale.docNumber,
      status: sale.status,
      totalEur: sale.totalEur,
      totalUah: sale.totalUah,
      exchangeRateEur: sale.exchangeRateEur,
      exchangeRateUsd: sale.exchangeRateUsd,
      priceTypeId: sale.priceTypeId,
      deliveryMethod: sale.deliveryMethod,
      novaPoshtaBranch: sale.novaPoshtaBranch,
      cashOnDelivery: sale.cashOnDelivery,
      codAmountUah: sale.codAmountUah,
      assignedAgentUserId: sale.assignedAgentUserId,
      onTradeAgent: sale.onTradeAgent,
      exportTo1C: sale.exportTo1C,
      expressWaybill: sale.expressWaybill,
      notes: sale.notes,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
      customer: sale.customer,
      items: sale.items.map((i) => ({
        id: i.id,
        weight: i.weight,
        quantity: i.quantity,
        pricePerKg: i.pricePerKg,
        priceEur: i.priceEur,
        barcode: i.barcode,
        product: i.product,
        lot: i.lot,
      })),
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

  // Ownership: manager — лише свої реалізації; admin — будь-яку.
  const ok = await canViewSale(user, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  const existing = await prisma.sale.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  // Проведена в 1С реалізація (`posted`) заблокована для будь-яких змін.
  if (isSaleLocked(existing.status)) {
    return NextResponse.json(
      { error: "Реалізацію проведено в 1С — редагування заборонено" },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = updateSaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Якщо змінюється статус — перевіряємо дозволеність переходу.
  // Кнопка «Зберегти та провести» (`post=true`) ⇒ перехід у `posted`.
  let nextStatus: string | undefined;
  const requestedStatus = input.post ? "posted" : input.status;
  if (requestedStatus && requestedStatus !== existing.status) {
    if (!isSaleTransitionAllowed(existing.status, requestedStatus)) {
      return NextResponse.json(
        {
          error: `Перехід «${existing.status}» → «${requestedStatus}» не дозволено`,
        },
        { status: 409 },
      );
    }
    nextStatus = requestedStatus;
  }

  try {
    const sale = await updateSaleWithItems(
      id,
      input,
      { userId: user.id },
      { nextStatus },
    );
    return NextResponse.json({
      id: sale.id,
      code1C: sale.code1C,
      docNumber: sale.docNumber,
      status: sale.status,
      totalEur: sale.totalEur,
      totalUah: sale.totalUah,
      exchangeRateEur: sale.exchangeRateEur,
      exchangeRateUsd: sale.exchangeRateUsd,
      notes: sale.notes,
      priceTypeId: sale.priceTypeId,
      deliveryMethod: sale.deliveryMethod,
      novaPoshtaBranch: sale.novaPoshtaBranch,
      cashOnDelivery: sale.cashOnDelivery,
      codAmountUah: sale.codAmountUah,
      assignedAgentUserId: sale.assignedAgentUserId,
      onTradeAgent: sale.onTradeAgent,
      exportTo1C: sale.exportTo1C,
      expressWaybill: sale.expressWaybill,
      updatedAt: sale.updatedAt.toISOString(),
      customer: sale.customer,
      items: sale.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        lotId: i.lotId,
        barcode: i.barcode,
        pricePerKg: i.pricePerKg,
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
    console.error("[L-TEX] Sale update failed", {
      saleId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка оновлення реалізації" },
      { status: 500 },
    );
  }
}

/**
 * Видалення документа реалізації (з контекстного меню списку).
 *
 * Ownership — як у GET/PATCH (`canViewSale`): менеджер видаляє лише свої, admin —
 * будь-яку. Працює і для проведених (`posted`) документів, бо саме на них «висить»
 * борг, який треба прибрати.
 *
 * Реверс сліду документа в одній транзакції:
 *   - рух боргу проведеної реалізації (`sourceType="sale"`, `sourceId=saleId`)
 *     видаляється → далі `MgrClient.debt` перераховується;
 *   - `SaleItem` видаляються каскадом (`onDelete: Cascade`);
 *   - `MgrCashOrder.saleId` обнуляється автоматично (`onDelete: SetNull`) — оплати
 *     зберігаються, лише відв'язуються від видаленої реалізації.
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

  const ok = await canViewSale(user, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  const existing = await prisma.sale.findUnique({
    where: { id },
    select: { id: true, customerId: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  try {
    // Клієнти, чий борг треба перерахувати після видалення рухів реалізації.
    const debtMovements = await prisma.mgrDebtMovement.findMany({
      where: { sourceType: "sale", sourceId: id },
      select: { clientId: true },
    });
    const affectedClientIds = new Set(debtMovements.map((m) => m.clientId));

    await prisma.$transaction(async (tx) => {
      await tx.mgrDebtMovement.deleteMany({
        where: { sourceType: "sale", sourceId: id },
      });
      await tx.sale.delete({ where: { id } });
    });

    // Резерв: якщо рухів не було (чернетка), все одно перерахуємо клієнта-власника.
    if (affectedClientIds.size === 0) {
      const clientId = await resolveClientIdByCustomer(
        prisma,
        existing.customerId,
      );
      if (clientId) affectedClientIds.add(clientId);
    }
    if (affectedClientIds.size > 0) {
      await recomputeDebtForClients(prisma, [...affectedClientIds]);
    }

    revalidatePath("/manager/sales");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[L-TEX] Sale delete failed", {
      saleId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка видалення реалізації" },
      { status: 500 },
    );
  }
}
