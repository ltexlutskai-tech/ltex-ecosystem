"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Input } from "@ltex/ui";
import { ProductPicker } from "./product-picker";
import { LotPicker } from "./lot-picker";
import type { OrderItemDraft } from "./types";

export function ItemRow({
  draft,
  onChange,
  onRemove,
  index,
}: {
  draft: OrderItemDraft;
  onChange: (next: OrderItemDraft) => void;
  onRemove: () => void;
  index: number;
}) {
  // Auto-fill priceEur коли user обрав lot.
  useEffect(() => {
    if (draft.bindToLot && draft.lot && draft.priceEur === 0) {
      onChange({
        ...draft,
        priceEur: draft.lot.priceEur,
        weight: draft.lot.weight,
        quantity: draft.lot.quantity,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.lot?.id]);

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          Позиція {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-400 hover:text-red-600"
          aria-label="Видалити позицію"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-gray-500">Товар</label>
          <ProductPicker
            value={draft.product}
            onChange={(product) =>
              onChange({ ...draft, product, lot: null, bindToLot: false })
            }
          />
        </div>

        {draft.product && (
          <>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={!draft.bindToLot}
                  onChange={() =>
                    onChange({ ...draft, bindToLot: false, lot: null })
                  }
                />
                <span>Загальна позиція</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={draft.bindToLot}
                  onChange={() => onChange({ ...draft, bindToLot: true })}
                />
                <span>Конкретний лот</span>
              </label>
            </div>

            {draft.bindToLot && (
              <div>
                <label className="mb-1 block text-xs text-gray-500">Лот</label>
                <LotPicker
                  productId={draft.product.id}
                  value={draft.lot}
                  onChange={(lot) =>
                    onChange({
                      ...draft,
                      lot,
                      priceEur: lot?.priceEur ?? draft.priceEur,
                      weight: lot?.weight ?? draft.weight,
                      quantity: lot?.quantity ?? draft.quantity,
                    })
                  }
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Вага, кг
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={draft.weight}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      weight: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Кількість
                </label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.quantity}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      quantity: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Ціна, €
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.priceEur}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      priceEur: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
