import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canExport } from "@/lib/permissions/role-permissions";
import {
  reportDebts,
  reportSalesByClient,
  reportSalesBySupplier,
  type ReportShape,
} from "@/lib/reports/analyst-reports";
import { buildCsv } from "@/lib/reports/csv-export";
import type { PeriodPreset } from "@/lib/finance/owner-stats";
import { logAuditEvent } from "@/lib/audit/audit-log";

/**
 * GET /api/v1/manager/reports/{reportId}/csv?period=...
 *
 * Завантаження CSV-файлу будь-якого зі звітів. Доступно тим ролям у яких
 * `canExport('reports')` = true (analyst, admin, owner за матрицею).
 */

const VALID_PERIODS: PeriodPreset[] = ["today", "week", "month", "year", "all"];

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
  const periodRaw = url.searchParams.get("period") ?? "month";
  const period: PeriodPreset = VALID_PERIODS.includes(periodRaw as PeriodPreset)
    ? (periodRaw as PeriodPreset)
    : "month";

  let report: ReportShape;
  switch (reportId) {
    case "sales-by-client":
      report = await reportSalesByClient(period);
      break;
    case "sales-by-supplier":
      report = await reportSalesBySupplier(period);
      break;
    case "debts":
      report = await reportDebts();
      break;
    default:
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
