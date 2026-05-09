import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listCustomers, type CustomerListSort } from "@/lib/admin-customers";

export const dynamic = "force-dynamic";

const VALID_SORTS = new Set<CustomerListSort>([
  "first_seen_desc",
  "last_order_desc",
  "orders_count_desc",
  "name_asc",
]);

// Hard cap for a single CSV export. Larger result sets must be narrowed via
// search / hasOrders / sort filters or split across multiple exports — keeps
// memory bounded so a growing customer base can't OOM the page.
const MAX_EXPORT = 5000;

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const hasOrdersRaw = url.searchParams.get("hasOrders");
  const hasOrders =
    hasOrdersRaw === "true"
      ? true
      : hasOrdersRaw === "false"
        ? false
        : undefined;
  const search = url.searchParams.get("q")?.trim() || undefined;
  const sortRaw = url.searchParams.get("sort");
  const sort: CustomerListSort = VALID_SORTS.has(sortRaw as CustomerListSort)
    ? (sortRaw as CustomerListSort)
    : "first_seen_desc";

  const { items, total } = await listCustomers({
    hasOrders,
    search,
    sort,
    page: 1,
    pageSize: MAX_EXPORT,
  });
  const truncatedBy = Math.max(0, total - MAX_EXPORT);

  const headers = [
    "Phone",
    "Name",
    "Email",
    "Telegram",
    "City",
    "Notes",
    "FirstSeen",
    "LastOrder",
    "OrdersCount",
    "TotalUAH",
  ];

  const lines: string[] = [headers.join(",")];
  for (const c of items) {
    lines.push(
      [
        csvField(c.phone ?? ""),
        csvField(c.name),
        csvField(c.email ?? ""),
        csvField(c.telegram ?? ""),
        csvField(c.city ?? ""),
        csvField(c.notes ?? ""),
        csvField(c.firstSeenAt.toISOString()),
        csvField(c.lastOrderAt ? c.lastOrderAt.toISOString() : ""),
        csvField(c.ordersCount),
        csvField(c.ordersTotalUah.toFixed(2)),
      ].join(","),
    );
  }

  // Prepend BOM so Excel opens UTF-8 correctly.
  const body = "﻿" + lines.join("\r\n");
  const filename = `ltex-customers-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      ...(truncatedBy > 0 ? { "X-Truncated": String(truncatedBy) } : {}),
    },
  });
}
