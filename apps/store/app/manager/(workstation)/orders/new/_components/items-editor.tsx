"use client";

import { Plus } from "lucide-react";
import { Button } from "@ltex/ui";
import { ItemRow } from "./item-row";
import type { OrderItemDraft } from "./types";

function emptyDraft(): OrderItemDraft {
  return {
    uid: `i-${Math.random().toString(36).slice(2, 10)}`,
    product: null,
    lot: null,
    bindToLot: false,
    weight: 0,
    quantity: 1,
    priceEur: 0,
  };
}

export function ItemsEditor({
  items,
  onChange,
}: {
  items: OrderItemDraft[];
  onChange: (next: OrderItemDraft[]) => void;
}) {
  function addRow(): void {
    onChange([...items, emptyDraft()]);
  }
  function updateRow(uid: string, next: OrderItemDraft): void {
    onChange(items.map((i) => (i.uid === uid ? next : i)));
  }
  function removeRow(uid: string): void {
    onChange(items.filter((i) => i.uid !== uid));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Позиції</h2>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-4 w-4" />
          Додати позицію
        </Button>
      </div>

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed bg-gray-50 p-6 text-center text-sm text-gray-500">
          Поки немає позицій. Натисніть «Додати позицію» щоб почати.
        </div>
      )}

      {items.map((draft, i) => (
        <ItemRow
          key={draft.uid}
          draft={draft}
          index={i}
          onChange={(next) => updateRow(draft.uid, next)}
          onRemove={() => removeRow(draft.uid)}
        />
      ))}
    </div>
  );
}

export { emptyDraft };
