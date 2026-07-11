import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { isRouteSheetLocked } from "@/lib/manager/route-sheet-status";
import {
  addLoadingByBarcode,
  addLoadingByLotId,
  computeRouteSheetCounters,
  deleteLoadingRow,
  RouteSheetLoadingError,
  updateLoadingRow,
} from "@/lib/manager/route-sheet-loading";
import {
  addLoadingSchema,
  updateLoadingSchema,
} from "@/lib/validations/manager-route-sheet";

/**
 * Маршрутний лист — вкладка Загрузка (скан). CRUD рядків `RouteSheetLoading`.
 *
 *  • POST   { barcode } — резолв ШК → лот → рядок Загрузки (гард чужої броні +
 *    дедуплікація лота + авто-прив'язка до замовлення); перерахунок
 *    `quantityLoaded` + лічильники.
 *  • DELETE ?loadingId= — видалення рядка + перерахунок.
 *  • PATCH  ?loadingId= — toggle `loaded`/`isReturn` або зміна ваги + перерахунок.
 *
 * Усі мутації заблоковано на завершеному (completed) МЛ (409, lock 1С
 * `ВозвратПоЗакритомуМаршрутнику`).
 */

/** Перевіряє, що МЛ існує і не завершено. Повертає NextResponse | null. */
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
  const parsed = addLoadingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  try {
    const { barcode, lotId, orderId } = parsed.data;
    const { row } = barcode
      ? await addLoadingByBarcode(id, barcode, user.id, new Date(), {
          targetOrderId: orderId ?? null,
        })
      : await addLoadingByLotId(id, lotId as string, new Date(), {
          targetOrderId: orderId ?? null,
        });
    const counters = await computeRouteSheetCounters(id);
    return NextResponse.json({ row, counters });
  } catch (err) {
    if (err instanceof RouteSheetLoadingError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[L-TEX] Route sheet loading add failed", {
      routeSheetId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка додавання у загрузку" },
      { status: 500 },
    );
  }
}

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

  const loadingId =
    new URL(req.url).searchParams.get("loadingId")?.trim() ?? "";
  if (!loadingId) {
    return NextResponse.json(
      { error: "Не вказано loadingId" },
      { status: 400 },
    );
  }

  await deleteLoadingRow(id, loadingId);
  const counters = await computeRouteSheetCounters(id);
  return NextResponse.json({ counters });
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
  const guard = await guardEditable(id);
  if (guard) return guard;

  const loadingId =
    new URL(req.url).searchParams.get("loadingId")?.trim() ?? "";
  if (!loadingId) {
    return NextResponse.json(
      { error: "Не вказано loadingId" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = updateLoadingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  try {
    await updateLoadingRow(id, loadingId, parsed.data);
    const counters = await computeRouteSheetCounters(id);
    return NextResponse.json({ counters });
  } catch (err) {
    if (err instanceof RouteSheetLoadingError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[L-TEX] Route sheet loading update failed", {
      routeSheetId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка оновлення рядка загрузки" },
      { status: 500 },
    );
  }
}
