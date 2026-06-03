import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  queryAuditLog,
  type AuditAction,
  type AuditLogQueryParams,
} from "@/lib/audit/audit-log";
import type { ManagerRole } from "@/lib/auth/jwt";

/**
 * GET /api/v1/manager/admin/audit
 *
 * Журнал дій — доступний тільки admin та owner. Параметри (всі опційні):
 *   userId, role, action, resource, resourceId, ownerOnly=true,
 *   from=YYYY-MM-DD, to=YYYY-MM-DD, q=пошук-у-summary, page, pageSize.
 *
 * Прогрес: коли owner відкриває цю сторінку, він бачить себе у логах.
 * Це задумано — owner МАЄ розуміти що ВСІ його дії видимі для admin.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole(["admin", "owner"], req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const params: AuditLogQueryParams = {
    userId: url.searchParams.get("userId") ?? undefined,
    role: (url.searchParams.get("role") as ManagerRole | null) ?? undefined,
    action: (url.searchParams.get("action") as AuditAction | null) ?? undefined,
    resource: url.searchParams.get("resource") ?? undefined,
    resourceId: url.searchParams.get("resourceId") ?? undefined,
    ownerOnly: url.searchParams.get("ownerOnly") === "true",
    search: url.searchParams.get("q") ?? undefined,
    page: Number(url.searchParams.get("page") ?? "1"),
    pageSize: Number(url.searchParams.get("pageSize") ?? "50"),
  };
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from) params.fromDate = new Date(from);
  if (to) params.toDate = new Date(to);

  const result = await queryAuditLog(params);
  return NextResponse.json(result);
}
