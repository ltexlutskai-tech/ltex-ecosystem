import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canViewSale } from "@/lib/manager/sale-ownership";
import {
  isSaleLocked,
  isSaleTransitionAllowed,
} from "@/lib/manager/sale-status";
import { updateSaleSchema } from "@/lib/validations/manager-sale";
import { updateSaleWithItems } from "@/lib/manager/sale-create";

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
