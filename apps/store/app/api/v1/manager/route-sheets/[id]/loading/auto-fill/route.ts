import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { isRouteSheetLocked } from "@/lib/manager/route-sheet-status";
import {
  autoFillLoading,
  computeRouteSheetCounters,
} from "@/lib/manager/route-sheet-loading";

/**
 * POST — «Заповнити з вільних лотів»: авто-підбір вільних лотів під замовлені
 * позиції (наш аналог 1С «Заповнити/Подбор» центральної бази, без обміну).
 * Блокується на завершеному (completed) МЛ.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const sheet = await prisma.routeSheet.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!sheet) {
    return NextResponse.json(
      { error: "Маршрутний лист не знайдено" },
      { status: 404 },
    );
  }
  if (isRouteSheetLocked(sheet.status)) {
    return NextResponse.json(
      { error: "Маршрутний лист завершено — редагування заборонено" },
      { status: 409 },
    );
  }

  const { added } = await autoFillLoading(id, user.id);
  const counters = await computeRouteSheetCounters(id);
  return NextResponse.json({ ok: true, added, counters });
}
