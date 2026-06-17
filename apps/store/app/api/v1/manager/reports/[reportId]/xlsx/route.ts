import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canExport } from "@/lib/permissions/role-permissions";
import { resolveReport } from "@/lib/reports/resolve-report";
import { buildXlsx } from "@/lib/reports/xlsx-export";
import { logAuditEvent } from "@/lib/audit/audit-log";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET /api/v1/manager/reports/{reportId}/xlsx?period=...
 *
 * Завантаження XLSX-файлу будь-якого зі звітів (← Фаза 7). Той самий гард
 * доступу і той самий резолвер даних, що й CSV-роут — лише інший формат на
 * виході (справжній OpenXML замість тексту з роздільниками).
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

  const buffer = await buildXlsx(report.headers, report.rows, report.title);
  const filename = `${reportId}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  void logAuditEvent({
    user: { id: user.id, email: user.email, role: user.role },
    action: "export",
    resource: "report",
    resourceId: reportId,
    summary: `Експорт XLSX: ${report.title} (${report.rows.length} рядків)`,
    req,
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
