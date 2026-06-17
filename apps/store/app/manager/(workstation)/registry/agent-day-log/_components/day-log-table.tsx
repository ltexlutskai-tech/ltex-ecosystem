"use client";

import {
  RegisterViewer,
  type RegisterColumn,
} from "../../../_components/register-viewer";
import {
  formatRegDateTime,
  type DayLogRow,
} from "@/lib/manager/misc-register-view";

const COLUMNS: RegisterColumn[] = [
  {
    key: "at",
    label: "Момент",
    nowrap: true,
    render: (row) => formatRegDateTime(String(row.at)),
  },
  { key: "agentName", label: "Агент" },
  {
    key: "kindLabel",
    label: "Подія",
    nowrap: true,
    render: (row) => {
      const label = String(row.kindLabel);
      const isStart = label === "Початок дня";
      return (
        <span
          className={
            isStart
              ? "font-medium text-emerald-700"
              : "font-medium text-gray-600"
          }
        >
          {label}
        </span>
      );
    },
  },
  { key: "note", label: "Нотатка" },
];

export function DayLogTable({
  rows,
  total,
}: {
  rows: DayLogRow[];
  total: number;
}) {
  return (
    <RegisterViewer
      columns={COLUMNS}
      rows={rows as unknown as Record<string, unknown>[]}
      csvFilename="agent-day-log"
      emptyMessage="Записів тайм-трекінгу за обраними фільтрами немає."
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
