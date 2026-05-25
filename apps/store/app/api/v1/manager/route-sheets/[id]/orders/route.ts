import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { isRouteSheetLocked } from "@/lib/manager/route-sheet-status";
import {
  addOrdersToRouteSheet,
  removeOrderFromRouteSheet,
  RouteSheetFillError,
} from "@/lib/manager/route-sheet-fill";
import { addOrdersSchema } from "@/lib/validations/manager-route-sheet";

/** Перевіряє, що МЛ існує і не завершено (lock). Повертає NextResponse | null. */
async function guardEditable(id: string): Promise<NextResponse | null> {
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
  return null;
}

/** POST — додати замовлення до МЛ. Body: `{ orderIds: string[] }`. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const guard = await guardEditable(id);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const parsed = addOrdersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  try {
    const result = await addOrdersToRouteSheet(id, parsed.data.orderIds);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof RouteSheetFillError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[L-TEX] Route sheet add orders failed", {
      routeSheetId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка додавання замовлень" },
      { status: 500 },
    );
  }
}

/** DELETE — прибрати замовлення з МЛ. Query: `?orderId=`. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const guard = await guardEditable(id);
  if (guard) return guard;

  const orderId = new URL(req.url).searchParams.get("orderId")?.trim() ?? "";
  if (!orderId) {
    return NextResponse.json({ error: "Не вказано orderId" }, { status: 400 });
  }

  const result = await removeOrderFromRouteSheet(id, orderId);
  return NextResponse.json(result);
}
