import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/warehouse/last-purchase-price?productId=...&supplierId=...
 *
 * Повертає останню зафіксовану ціну закупки для (товар, постачальник) — для
 * автопідстановки у форму поступлення (← Хвиля 2 правок 2026-06-05).
 *
 * Якщо для пари (товар, постачальник) ще немає історії — fallback на
 * максимум по постачальнику чи 0.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") ?? "";
  const supplierId = url.searchParams.get("supplierId") ?? "";
  if (!productId || !supplierId) {
    return NextResponse.json({ price: null });
  }

  // 1. Точне співпадіння (товар + постачальник)
  const exact = await prisma.purchasePrice.findFirst({
    where: { productId, supplierId },
    orderBy: { validFrom: "desc" },
    select: { priceEur: true, validFrom: true },
  });
  if (exact) {
    return NextResponse.json({
      price: exact.priceEur,
      validFrom: exact.validFrom,
      source: "exact",
    });
  }

  // 2. Fallback: остання ціна цього товара від будь-якого постачальника
  const anySupplier = await prisma.purchasePrice.findFirst({
    where: { productId },
    orderBy: { validFrom: "desc" },
    select: { priceEur: true, validFrom: true, supplierId: true },
  });
  if (anySupplier) {
    return NextResponse.json({
      price: anySupplier.priceEur,
      validFrom: anySupplier.validFrom,
      source: "any_supplier",
    });
  }

  return NextResponse.json({ price: null });
}
