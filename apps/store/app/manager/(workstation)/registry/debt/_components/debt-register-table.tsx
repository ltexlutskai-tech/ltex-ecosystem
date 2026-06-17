"use client";

import Link from "next/link";
import {
  RegisterViewer,
  type RegisterColumn,
} from "../../../_components/register-viewer";
import type { DebtRegisterRow } from "@/lib/manager/debt-register-view";

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
    key: "occurredAt",
    label: "Дата",
    nowrap: true,
    render: (row) => formatDate(String(row.occurredAt)),
  },
  {
    key: "clientName",
    label: "Клієнт",
    render: (row) => {
      const clientId = row.clientId as string | null;
      const name = String(row.clientName);
      return clientId ? (
        <Link
          href={`/manager/customers/${clientId}`}
          className="text-emerald-700 hover:underline"
        >
          {name}
        </Link>
      ) : (
        name
      );
    },
  },
  {
    key: "amountEur",
    label: "Сума €",
    align: "right",
    nowrap: true,
    render: (row) => {
      const v = Number(row.amountEur);
      if (v > 0) {
        return (
          <span className="font-medium text-red-700">+{v.toFixed(2)} €</span>
        );
      }
      if (v < 0) {
        return (
          <span className="font-medium text-green-700">{v.toFixed(2)} €</span>
        );
      }
      return <span className="text-gray-500">0.00 €</span>;
    },
  },
  { key: "kindLabel", label: "Вид", nowrap: true },
  { key: "sourceLabel", label: "Джерело", nowrap: true },
  { key: "note", label: "Нотатка" },
];

export function DebtRegisterTable({
  rows,
  total,
  totalAmount,
}: {
  rows: DebtRegisterRow[];
  total: number;
  totalAmount: number;
}) {
  return (
    <RegisterViewer
      columns={COLUMNS}
      rows={rows as unknown as Record<string, unknown>[]}
      csvFilename="debt-register"
      emptyMessage="Рухів боргу за обраними фільтрами немає."
      summary={
        rows.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-600">
              Рухів за фільтром: <strong>{total}</strong>
            </span>
            <span className="text-gray-600">
              Сума за фільтром:{" "}
              <strong
                className={
                  totalAmount > 0
                    ? "text-red-700"
                    : totalAmount < 0
                      ? "text-green-700"
                      : "text-gray-700"
                }
              >
                {totalAmount > 0 ? "+" : ""}
                {totalAmount.toFixed(2)} €
              </strong>
            </span>
          </div>
        ) : null
      }
    />
  );
}
