import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/warehouse/barcode/check?code=...
 *
 * Перевіряє чи штрихкод уже існує у системі (у будь-якому лоті).
 * Використовується у формі поступлення для попередження при скануванні
 * того ж мішка двічі — узгоджено з user 2026-06-04.
 *
 * Якщо штрихкод належить лоту цього ж receivingId — НЕ вважається дублем.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  const excludeReceivingId = url.searchParams.get("excludeReceivingId") ?? null;
  if (code.length < 2) {
    return NextResponse.json({ exists: false });
  }
  const lot = await prisma.lot.findFirst({
    where: {
      barcode: code,
      ...(excludeReceivingId
        ? { receivingId: { not: excludeReceivingId } }
        : {}),
    },
    select: {
      id: true,
      barcode: true,
      weight: true,
      status: true,
      product: { select: { id: true, name: true, articleCode: true } },
      supplier: { select: { name: true } },
    },
  });
  return NextResponse.json({
    exists: lot !== null,
    lot: lot
      ? {
          id: lot.id,
          barcode: lot.barcode,
          weight: lot.weight,
          status: lot.status,
          productName: lot.product?.name ?? "—",
          articleCode: lot.product?.articleCode ?? null,
          supplierName: lot.supplier?.name ?? null,
        }
      : null,
  });
}
