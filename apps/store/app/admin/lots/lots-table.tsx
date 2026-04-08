"use client";

import { useState } from "react";
import { Badge } from "@ltex/ui";
import { LOT_STATUS_LABELS, type LotStatus } from "@ltex/shared";
import { LotStatusForm } from "./lot-status-form";
import { BulkActions } from "./bulk-actions";

const statusColors: Record<LotStatus, "default" | "secondary" | "accent"> = {
  free: "default",
  reserved: "accent",
  on_sale: "secondary",
};

interface LotRow {
  id: string;
  barcode: string;
  weight: number;
  quantity: number;
  priceEur: number;
  status: string;
  product: { name: string; slug: string };
}

export function LotsTable({ lots }: { lots: LotRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = lots.length > 0 && selected.size === lots.length;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(lots.map((l) => l.id)));
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <>
      <BulkActions
        selectedIds={Array.from(selected)}
        onDone={() => setSelected(new Set())}
      />

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Вибрати всі"
                />
              </th>
              <th className="px-4 py-3 font-medium">Штрихкод</th>
              <th className="px-4 py-3 font-medium">Товар</th>
              <th className="px-4 py-3 font-medium">Вага (кг)</th>
              <th className="px-4 py-3 font-medium">К-сть</th>
              <th className="px-4 py-3 font-medium">Ціна EUR</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Змінити</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => (
              <tr key={lot.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(lot.id)}
                    onChange={() => toggle(lot.id)}
                    aria-label={`Вибрати ${lot.barcode}`}
                  />
                </td>
                <td className="px-4 py-3 font-mono text-xs">{lot.barcode}</td>
                <td className="px-4 py-3">
                  <div className="max-w-xs truncate">{lot.product.name}</div>
                </td>
                <td className="px-4 py-3">{lot.weight}</td>
                <td className="px-4 py-3">{lot.quantity}</td>
                <td className="px-4 py-3">€{lot.priceEur.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      statusColors[lot.status as LotStatus] ?? "secondary"
                    }
                  >
                    {LOT_STATUS_LABELS[lot.status as LotStatus] ?? lot.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <LotStatusForm
                    lotId={lot.id}
                    currentStatus={lot.status as LotStatus}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
