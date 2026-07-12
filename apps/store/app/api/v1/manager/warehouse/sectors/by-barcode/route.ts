import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/warehouse/sectors/by-barcode?code=...
 *
 * Резолв сектора за штрихкодом (активний сектор при скануванні). 404 якщо ШК
 * не належить жодному сектору.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user)
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const code = (new URL(req.url).searchParams.get("code") ?? "").trim();
  if (!code)
    return NextResponse.json({ error: "Не вказано ШК" }, { status: 400 });
  const sector = await prisma.warehouseSector.findUnique({
    where: { barcode: code },
    select: { id: true, name: true, barcode: true },
  });
  if (!sector)
    return NextResponse.json({ error: "Сектор не знайдено" }, { status: 404 });
  return NextResponse.json({ sector });
}
