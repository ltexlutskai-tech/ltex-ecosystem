import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * Склади (← Тиждень 2 блоку Поступлення).
 * Поки читання тільки. Створення/редагування — через admin-UI пізніше
 * (зараз у L-TEX один склад "Основний", міграція створила його авто).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: {
      id: true,
      code1C: true,
      name: true,
      address: true,
      isDefault: true,
    },
  });
  return NextResponse.json({ items: warehouses });
}
