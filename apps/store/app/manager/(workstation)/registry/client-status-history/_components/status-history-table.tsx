"use client";

import {
  RegisterViewer,
  type RegisterColumn,
} from "../../../_components/register-viewer";
import {
  formatRegDate,
  type StatusHistoryRow,
} from "@/lib/manager/misc-register-view";

const COLUMNS: RegisterColumn[] = [
  {
    key: "changedAt",
    label: "Дата зміни",
    nowrap: true,
    render: (row) => formatRegDate(String(row.changedAt)),
  },
  { key: "clientCode1C", label: "Контрагент (1С-код)", nowrap: true },
  { key: "statusCode1C", label: "Статус (1С-код)", nowrap: true },
  { key: "operationalStatus", label: "Оперативний статус" },
];

export function StatusHistoryTable({
  rows,
  total,
}: {
  rows: StatusHistoryRow[];
  total: number;
}) {
  return (
    <RegisterViewer
      columns={COLUMNS}
      rows={rows as unknown as Record<string, unknown>[]}
      csvFilename="client-status-history"
      emptyMessage="Записів історії статусів за обраними фільтрами немає."
      summary={
        rows.length > 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            Записів за фільтром: <strong>{total}</strong>
          </div>
        ) : null
      }
    />
  );
}
