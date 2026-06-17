"use client";

import {
  RegisterViewer,
  type RegisterColumn,
} from "../../../_components/register-viewer";
import type { RateRegisterRow } from "@/lib/manager/rates-register-view";

/** Дата ISO → ДД.ММ.РРРР. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const COLUMNS: RegisterColumn[] = [
  {
    key: "date",
    label: "Дата",
    nowrap: true,
    render: (row) => formatDate(String(row.date)),
  },
  { key: "currency", label: "Валюта", nowrap: true },
  {
    key: "rate",
    label: "Курс (₴)",
    align: "right",
    nowrap: true,
    render: (row) => Number(row.rate).toFixed(4),
  },
  {
    key: "multiplier",
    label: "Кратність",
    align: "right",
    nowrap: true,
    render: (row) => String(row.multiplier),
  },
];

export function RatesRegisterTable({
  rows,
  total,
}: {
  rows: RateRegisterRow[];
  total: number;
}) {
  return (
    <RegisterViewer
      columns={COLUMNS}
      rows={rows as unknown as Record<string, unknown>[]}
      csvFilename="exchange-rates"
      emptyMessage="Курсів за обраними фільтрами немає."
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
