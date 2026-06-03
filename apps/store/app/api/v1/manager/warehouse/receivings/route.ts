import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canCreate, canView } from "@/lib/permissions/role-permissions";
import { logAuditEvent } from "@/lib/audit/audit-log";
import { receivingCreateSchema } from "@/lib/warehouse/validations";
import { generateReceivingDocNumber } from "@/lib/warehouse/doc-number";

/**
 * GET /api/v1/manager/warehouse/receivings
 *   список поступлень з фільтрами (status, supplierId, period, q)
 *
 * POST /api/v1/manager/warehouse/receivings
 *   створення draft з опційними items (warehouse або вище)
 */

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const access = canView({ role: user.role }, "receivings");
  if (!access.allowed) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const supplierId = url.searchParams.get("supplierId");
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = 30;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (supplierId) where.supplierId = supplierId;
  if (q) {
    where.OR = [
      { docNumber: { contains: q, mode: "insensitive" } },
      { inboundDocNumber: { contains: q, mode: "insensitive" } },
      { supplier: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.receiving.count({ where }),
    prisma.receiving.findMany({
      where,
      orderBy: { docDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        docNumber: true,
        docDate: true,
        status: true,
        currency: true,
        totalAmount: true,
        totalWeight: true,
        totalQuantity: true,
        supplier: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canCreate({ role: user.role }, "receivings")) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = receivingCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Перевірка існування постачальника + складу
  const [supplier, warehouse] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: data.supplierId } }),
    prisma.warehouse.findUnique({ where: { id: data.warehouseId } }),
  ]);
  if (!supplier) {
    return NextResponse.json(
      { error: "Постачальник не знайдений" },
      { status: 400 },
    );
  }
  if (!warehouse) {
    return NextResponse.json({ error: "Склад не знайдений" }, { status: 400 });
  }

  const docNumber = await generateReceivingDocNumber(data.docDate);

  // Транзакція: створення документа + рядків
  const created = await prisma.$transaction(async (tx) => {
    const receiving = await tx.receiving.create({
      data: {
        docNumber,
        docDate: data.docDate,
        supplierId: data.supplierId,
        warehouseId: data.warehouseId,
        currency: data.currency,
        exchangeRate: data.exchangeRate,
        inboundDocNumber: data.inboundDocNumber,
        inboundDocDate: data.inboundDocDate,
        notes: data.notes,
        status: "draft",
        createdByUserId: user.id,
      },
    });

    let totalWeight = 0;
    let totalAmount = 0;
    let totalQuantity = 0;
    for (const item of data.items) {
      const lineAmount = item.weight * item.quantity * item.purchasePrice;
      await tx.receivingItem.create({
        data: {
          receivingId: receiving.id,
          productId: item.productId,
          weight: item.weight,
          quantity: item.quantity,
          purchasePrice: item.purchasePrice,
          lineAmount,
          barcode: item.barcode ?? null,
          barcodeSource: item.barcodeSource,
          notes: item.notes ?? null,
        },
      });
      totalWeight += item.weight * item.quantity;
      totalAmount += lineAmount;
      totalQuantity += item.quantity;
    }

    if (data.items.length > 0) {
      await tx.receiving.update({
        where: { id: receiving.id },
        data: { totalWeight, totalAmount, totalQuantity },
      });
    }

    return receiving;
  });

  void logAuditEvent({
    user: { id: user.id, email: user.email, role: user.role },
    action: "create",
    resource: "receiving",
    resourceId: created.id,
    summary: `Створено поступлення ${docNumber} (постачальник ${supplier.name})`,
    dataAfter: {
      docNumber,
      supplierId: supplier.id,
      warehouseId: warehouse.id,
    },
    req,
  });

  return NextResponse.json({ id: created.id, docNumber }, { status: 201 });
}
