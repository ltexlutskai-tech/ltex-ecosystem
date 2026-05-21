import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/sale-ownership";
import {
  buildSalesWhere,
  normalizeSaleStatus,
  saleRowInclude,
  serializeSaleRow,
} from "@/lib/manager/sales-list";

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
  const status = normalizeSaleStatus(
    url.searchParams.get("status")?.trim() ?? "",
  );
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  const clientCode1C = url.searchParams.get("clientCode1C")?.trim() ?? "";
  const showArchived = url.searchParams.get("showArchived") === "true";
  const page = parseInteger(url.searchParams.get("page"), 1, 1, 9_999);
  const pageSize = parseInteger(url.searchParams.get("pageSize"), 20, 10, 100);

  // Visibility scope (manager → тільки свої клієнти)
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    // Manager без жодного призначеного клієнта → нічого не видно.
    if (myCodes.length === 0) {
      return NextResponse.json({ items: [], total: 0, page, pageSize });
    }
    // Deeplink по чужому клієнту → нічого не видно (не послаблюємо ownership).
    if (clientCode1C && !myCodes.includes(clientCode1C)) {
      return NextResponse.json({ items: [], total: 0, page, pageSize });
    }
  }

  const where = buildSalesWhere({
    scope: myCodes,
    clientCode1C: clientCode1C || undefined,
    search,
    status,
    from,
    to,
    showArchived,
  });

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: saleRowInclude,
    }),
    prisma.sale.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((s) => {
      const row = serializeSaleRow(s);
      return {
        ...row,
        createdAt: row.createdAt.toISOString(),
      };
    }),
    total,
    page,
    pageSize,
  });
}
