/**
 * Кнопки експорту звіту у XLSX / CSV (← полір Фази 7).
 *
 * Лінки на generic-роути `/api/v1/manager/reports/{reportId}/{xlsx,csv}` —
 * ті самі дані, що на сторінці, резолвляться через `resolveReport(reportId)`.
 * Параметри звіту (period / from / to / group / clientId) передаються як
 * `query` (готовий рядок без `?`).
 */
export function ReportExportButtons({
  reportId,
  query,
}: {
  reportId: string;
  /** Готовий query-рядок без провідного `?` (напр. `from=...&to=...&group=...`). */
  query?: string;
}) {
  const suffix = query ? `?${query}` : "";
  const base = `/api/v1/manager/reports/${reportId}`;
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`${base}/xlsx${suffix}`}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
      >
        📊 Експорт XLSX
      </a>
      <a
        href={`${base}/csv${suffix}`}
        className="rounded-md border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
      >
        📥 CSV
      </a>
    </div>
  );
}
