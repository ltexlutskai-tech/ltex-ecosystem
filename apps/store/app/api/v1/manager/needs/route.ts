import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { computeNeeds, type NeedsFilters } from "@/lib/manager/needs";

/**
 * GET /api/v1/manager/needs
 *
 * On-the-fly агрегація потреби (1С `ОбщаяПотребність`). Ownership дзеркалить
 * список замовлень: manager → лише свої клієнти; admin/owner → усі.
 *
 * Query:
 *  • clientId?    — точковий клієнт (Customer.id);
 *  • agentUserId? — фільтр по призначеному агенту;
 *  • city?        — фільтр по місту (contains);
 *  • dateFrom?/dateTo? — період створення замовлень;
 *  • deficitOnly? — за замовчуванням `true` (товари з needed > 0).
 */

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
  const filters: NeedsFilters = {
    clientId: url.searchParams.get("clientId")?.trim() || undefined,
    agentUserId: url.searchParams.get("agentUserId")?.trim() || undefined,
    city: url.searchParams.get("city")?.trim() || undefined,
    dateFrom: parseDate(url.searchParams.get("dateFrom")),
    dateTo: parseDate(url.searchParams.get("dateTo")),
    // Default true; явне ?deficitOnly=false вимикає фільтр.
    deficitOnly: url.searchParams.get("deficitOnly") !== "false",
  };

  const result = await computeNeeds(filters, user);
  return NextResponse.json(result);
}
