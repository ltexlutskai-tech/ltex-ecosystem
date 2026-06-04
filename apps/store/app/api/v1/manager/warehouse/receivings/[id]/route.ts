import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  canView,
  canEdit,
  canDelete,
} from "@/lib/permissions/role-permissions";
import { logAuditEvent } from "@/lib/audit/audit-log";
import { receivingUpdateSchema } from "@/lib/warehouse/validations";

/**
 * GET /api/v1/manager/warehouse/receivings/[id]
 *   повна деталь + items
 *
 * PATCH /api/v1/manager/warehouse/receivings/[id]
 *   оновлення (тільки status=draft; для posted — 409)
 *   items[] — replace-all
 *
 * DELETE /api/v1/manager/warehouse/receivings/[id]
 *   видалення (тільки draft; для posted — використати POST /cancel)
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canView({ role: user.role }, "receivings").allowed) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }
  const { id } = await params;

  const doc = await prisma.receiving.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true, currency: true } },
      warehouse: { select: { id: true, name: true } },
      createdBy: { select: { id: true, fullName: true } },
      postedBy: { select: { id: true, fullName: true } },
      cancelledBy: { select: { id: true, fullName: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: {
            select: { id: true, name: true, articleCode: true, code1C: true },
          },
          createdLot: {
            select: { id: true, barcode: true, status: true },
          },
        },
      },
    },
  });
  if (!doc) {
    return NextResponse.json(
      { error: "Документ не знайдений" },
      { status: 404 },
    );
  }
  return NextResponse.json({ receiving: doc });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canEdit({ role: user.role }, "receivings")) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.receiving.findUnique({
    where: { id },
    select: { status: true, docNumber: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Документ не знайдений" },
      { status: 404 },
    );
  }
  // Узгоджено з user 2026-06-03 (питання 5, А): тільки draft може редагуватись;
  // для posted/cancelled — admin/owner повертає у draft окремо (TODO).
  if (existing.status !== "draft") {
    if (user.role !== "admin" && user.role !== "owner") {
      return NextResponse.json(
        {
          error: `Документ у статусі "${existing.status}" — редагування дозволено тільки admin/owner`,
        },
        { status: 409 },
      );
    }
  }

  const json = await req.json().catch(() => null);
  const parsed = receivingUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Перевірка дублів штрихкодів у нових items
  if (data.items !== undefined) {
    const itemBarcodes = data.items
      .map((i) => (i.barcode ?? "").trim())
      .filter((b) => b.length > 0);
    const dup = itemBarcodes.find((b, i) => itemBarcodes.indexOf(b) !== i);
    if (dup) {
      return NextResponse.json(
        { error: `Штрихкод "${dup}" повторюється у документі` },
        { status: 400 },
      );
    }
    if (itemBarcodes.length > 0) {
      const existing = await prisma.lot.findMany({
        where: {
          barcode: { in: itemBarcodes },
          // Виключаємо лоти що належать цьому ж документу (раніше створені)
          receivingId: { not: id },
        },
        select: { barcode: true },
      });
      if (existing.length > 0) {
        return NextResponse.json(
          {
            error: `Штрихкод вже існує у системі: ${existing[0]?.barcode ?? ""}`,
          },
          { status: 409 },
        );
      }
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Якщо передано items — replace-all
    if (data.items !== undefined) {
      await tx.receivingItem.deleteMany({ where: { receivingId: id } });
      let totalWeight = 0;
      let totalAmount = 0;
      for (const item of data.items) {
        const lineAmount = item.weight * item.purchasePrice;
        await tx.receivingItem.create({
          data: {
            receivingId: id,
            productId: item.productId,
            weight: item.weight,
            quantity: 1,
            purchasePrice: item.purchasePrice,
            salePrice: item.salePrice ?? null,
            lineAmount,
            barcode: item.barcode ?? null,
            barcodeSource: item.barcodeSource,
            sector: item.sector ?? null,
            notes: item.notes ?? null,
          },
        });
        totalWeight += item.weight;
        totalAmount += lineAmount;
      }
      const totalQuantity = data.items.length;
      return tx.receiving.update({
        where: { id },
        data: {
          supplierId: data.supplierId,
          warehouseId: data.warehouseId,
          docDate: data.docDate,
          currency: "EUR",
          exchangeRate: 1,
          notes: data.notes,
          totalWeight,
          totalAmount,
          totalQuantity,
        },
      });
    }

    return tx.receiving.update({
      where: { id },
      data: {
        supplierId: data.supplierId,
        warehouseId: data.warehouseId,
        docDate: data.docDate,
        notes: data.notes,
      },
    });
  });

  void logAuditEvent({
    user: { id: user.id, email: user.email, role: user.role },
    action: "update",
    resource: "receiving",
    resourceId: id,
    summary: `Оновлено поступлення ${existing.docNumber}`,
    req,
  });

  return NextResponse.json({ id: updated.id });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canDelete({ role: user.role }, "receivings")) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.receiving.findUnique({
    where: { id },
    select: { status: true, docNumber: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Документ не знайдений" },
      { status: 404 },
    );
  }
  if (existing.status !== "draft") {
    return NextResponse.json(
      {
        error: `Видалити можна тільки draft (поточний "${existing.status}"). Використайте /cancel.`,
      },
      { status: 409 },
    );
  }

  await prisma.receiving.delete({ where: { id } });

  void logAuditEvent({
    user: { id: user.id, email: user.email, role: user.role },
    action: "delete",
    resource: "receiving",
    resourceId: id,
    summary: `Видалено draft поступлення ${existing.docNumber}`,
    req,
  });

  return NextResponse.json({ ok: true });
}
