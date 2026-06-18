import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canExport } from "@/lib/permissions/role-permissions";
import { resolveReport } from "@/lib/reports/resolve-report";
import { buildCsv } from "@/lib/reports/csv-export";
import { logAuditEvent } from "@/lib/audit/audit-log";

/**
 * GET /api/v1/manager/reports/{reportId}/csv?period=...
 *
 * Завантаження CSV-файлу будь-якого зі звітів. Доступно тим ролям у яких
 * `canExport('reports')` = true (analyst, admin, owner за матрицею). Той самий
 * резолвер даних, що й XLSX-роут (`resolveReport`).
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canExport({ role: user.role }, "reports")) {
    return NextResponse.json(
      { error: "Нема доступу до експорту" },
      { status: 403 },
    );
  }
  const { reportId } = await params;
  const url = new URL(req.url);

  const report = await resolveReport(reportId, url.searchParams);
  if (!report) {
    return NextResponse.json(
      { error: `Невідомий звіт: ${reportId}` },
      { status: 404 },
    );
  }

  const csv = buildCsv(report.headers, report.rows);
  const filename = `${reportId}_${new Date().toISOString().slice(0, 10)}.csv`;

  void logAuditEvent({
    user: { id: user.id, email: user.email, role: user.role },
    action: "export",
    resource: "report",
    resourceId: reportId,
    summary: `Експорт CSV: ${report.title} (${report.rows.length} рядків)`,
    req,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
