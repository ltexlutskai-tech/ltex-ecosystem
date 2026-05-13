"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { DashboardCurrencyEditModal } from "./dashboard-currency-edit-modal";

export function DashboardCurrencyRow({
  eur,
  usd,
  canEdit,
}: {
  eur: number | null;
  usd: number | null;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (eur == null && usd == null) {
    return (
      <div className="rounded-lg border bg-white p-4 text-sm text-gray-500 shadow-sm">
        Курси не завантажені з 1С.
        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-2 text-green-700 hover:underline"
          >
            Задати вручну
          </button>
        )}
        {canEdit && (
          <DashboardCurrencyEditModal
            open={open}
            onOpenChange={setOpen}
            eur={eur}
            usd={usd}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-white p-4 text-sm text-gray-700 shadow-sm">
      <span className="font-medium text-gray-500">Курси:</span>
      <span>
        EUR <span className="font-semibold">{format(eur)}</span> грн
      </span>
      <span className="text-gray-300">·</span>
      <span>
        USD <span className="font-semibold">{format(usd)}</span> грн
      </span>
      {canEdit && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Редагувати курси"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <DashboardCurrencyEditModal
            open={open}
            onOpenChange={setOpen}
            eur={eur}
            usd={usd}
          />
        </>
      )}
    </div>
  );
}

function format(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
