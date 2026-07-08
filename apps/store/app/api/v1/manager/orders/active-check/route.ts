import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { findOtherActiveOrder } from "@/lib/manager/order-active-guard";
import { formatOrderNumber } from "@/lib/manager/order-number";

/**
 * GET /api/v1/manager/orders/active-check?clientId=<MgrClient.id>
 *
 * Раннє попередження (7.3): чи є у клієнта вже активне замовлення. Резолвимо
 * MgrClient → Customer (за code1C або основним телефоном) і шукаємо активне
 * замовлення. Використовується формою замовлення одразу при виборі клієнта —
 * щоб показати діалог конфлікту до заповнення позицій.
 *
 * Повертає `{ existingOrderId, existingOrderNumber }` або `{ existingOrderId: null }`.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const clientId = req.nextUrl.searchParams.get("clientId")?.trim();
  if (!clientId) {
    return NextResponse.json({ existingOrderId: null });
  }

  const mgr = await prisma.mgrClient.findUnique({
    where: { id: clientId },
    select: { code1C: true, phonePrimary: true },
  });
  if (!mgr) return NextResponse.json({ existingOrderId: null });

  const or: { code1C?: string; phone?: string }[] = [];
  if (mgr.code1C) or.push({ code1C: mgr.code1C });
  if (mgr.phonePrimary) or.push({ phone: mgr.phonePrimary });
  if (or.length === 0) return NextResponse.json({ existingOrderId: null });

  const customer = await prisma.customer.findFirst({
    where: { OR: or },
    select: { id: true },
  });
  if (!customer) return NextResponse.json({ existingOrderId: null });

  const other = await findOtherActiveOrder(customer.id);
  if (!other) return NextResponse.json({ existingOrderId: null });

  return NextResponse.json({
    existingOrderId: other.id,
    existingOrderNumber: formatOrderNumber(other),
  });
}
