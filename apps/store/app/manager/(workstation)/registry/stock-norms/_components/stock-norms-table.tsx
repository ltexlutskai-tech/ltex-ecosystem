"use client";

import {
  RegisterViewer,
  type RegisterColumn,
} from "../../../_components/register-viewer";
import {
  formatRegDate,
  type StockNormRow,
} from "@/lib/manager/misc-register-view";

const COLUMNS: RegisterColumn[] = [
  { key: "productCode1C", label: "Номенклатура (1С-код)", nowrap: true },
  { key: "warehouseCode1C", label: "Склад (1С-код)", nowrap: true },
  { key: "norm", label: "Норма", align: "right", nowrap: true },
  {
    key: "setAt",
    label: "Дата",
    nowrap: true,
    render: (row) => formatRegDate(String(row.setAt)),
  },
];

export function StockNormsTable({
  rows,
  total,
}: {
  rows: StockNormRow[];
  total: number;
}) {
  return (
    <RegisterViewer
      columns={COLUMNS}
      rows={rows as unknown as Record<string, unknown>[]}
      csvFilename="stock-norms"
      emptyMessage="Норм запасів за обраними фільтрами немає."
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
