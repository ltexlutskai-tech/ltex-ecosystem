"use client";

import { useEffect, useState } from "react";
import type { LotSummary } from "./types";

export function LotPicker({
  productId,
  value,
  onChange,
}: {
  productId: string;
  value: LotSummary | null;
  onChange: (lot: LotSummary | null) => void;
}) {
  const [lots, setLots] = useState<LotSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/manager/products/${productId}/lots`)
      .then((r) => r.json())
      .then((json: { items: LotSummary[] }) => {
        setLots(json.items ?? []);
      })
      .catch((e: unknown) => {
        console.warn("[LotPicker] fetch failed", e);
      })
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return (
      <div className="rounded border bg-gray-50 p-2 text-xs text-gray-500">
        Завантаження лотів…
      </div>
    );
  }

  if (lots.length === 0) {
    return (
      <div className="rounded border bg-amber-50 p-2 text-xs text-amber-700">
        Немає вільних лотів. Виберіть «Загальна позиція», менеджер призначить
        лот пізніше.
      </div>
    );
  }

  return (
    <select
      value={value?.id ?? ""}
      onChange={(e) => {
        const id = e.target.value;
        const lot = lots.find((l) => l.id === id) ?? null;
        onChange(lot);
      }}
      className="h-9 w-full rounded border border-gray-300 bg-white px-2 text-sm"
    >
      <option value="">— Виберіть лот —</option>
      {lots.map((lot) => (
        <option key={lot.id} value={lot.id}>
          {lot.barcode} · {lot.weight.toFixed(1)} кг · €
          {lot.priceEur.toFixed(2)}
        </option>
      ))}
    </select>
  );
}
