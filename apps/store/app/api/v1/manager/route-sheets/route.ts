import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildRouteSheetsWhere,
  normalizeRouteSheetStatus,
  routeSheetRowInclude,
  serializeRouteSheetRow,
} from "@/lib/manager/route-sheets-list";
import { createRouteSheetSchema } from "@/lib/validations/manager-route-sheet";

function parseInteger(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const status = normalizeRouteSheetStatus(
    url.searchParams.get("status")?.trim() ?? "",
  );
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  const archived = url.searchParams.get("archived") === "true";
  const page = parseInteger(url.searchParams.get("page"), 1, 1, 9_999);
  const pageSize = parseInteger(url.searchParams.get("pageSize"), 20, 10, 100);

  // Маршрутний лист — спільний диспетчерський документ: усі менеджери + admin
  // бачать усі листи (без client-ownership скоупу).
  const where = buildRouteSheetsWhere({ search, status, from, to, archived });

  const [items, total] = await Promise.all([
    prisma.routeSheet.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: routeSheetRowInclude,
    }),
    prisma.routeSheet.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((r) => {
      const row = serializeRouteSheetRow(r);
      return {
        ...row,
        date: row.date.toISOString(),
        arrivalDate: row.arrivalDate ? row.arrivalDate.toISOString() : null,
      };
    }),
    total,
    page,
    pageSize,
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createRouteSheetSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const sheet = await prisma.routeSheet.create({
    data: {
      date: input.date ? new Date(input.date) : undefined,
      arrivalDate: input.arrivalDate ? new Date(input.arrivalDate) : null,
      routeId: input.routeId ?? null,
      expeditorUserId: input.expeditorUserId ?? null,
      createdByUserId: user.id,
      comment: input.comment ?? null,
      status: "draft",
    },
  });

  return NextResponse.json(
    {
      id: sheet.id,
      code1C: sheet.code1C,
      docNumber: sheet.docNumber,
      date: sheet.date.toISOString(),
      arrivalDate: sheet.arrivalDate ? sheet.arrivalDate.toISOString() : null,
      status: sheet.status,
      routeId: sheet.routeId,
      expeditorUserId: sheet.expeditorUserId,
      comment: sheet.comment,
      totalEur: sheet.totalEur,
      totalUah: sheet.totalUah,
    },
    { status: 201 },
  );
}
