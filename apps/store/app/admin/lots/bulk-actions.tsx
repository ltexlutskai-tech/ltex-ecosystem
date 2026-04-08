"use client";

import { useState } from "react";
import { Button } from "@ltex/ui";
import { toast } from "@ltex/ui";
import { LOT_STATUSES, LOT_STATUS_LABELS, type LotStatus } from "@ltex/shared";
import { bulkUpdateLotStatus } from "./actions";

export function BulkActions({
  selectedIds,
  onDone,
}: {
  selectedIds: string[];
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleBulk(status: LotStatus) {
    if (selectedIds.length === 0) return;
    setLoading(true);
    try {
      await bulkUpdateLotStatus(selectedIds, status);
      toast({
        title: "Статуси оновлено",
        description: `${selectedIds.length} лотів → ${LOT_STATUS_LABELS[status]}`,
        variant: "success",
      });
      onDone();
    } catch {
      toast({
        title: "Помилка",
        description: "Не вдалося оновити статуси",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  if (selectedIds.length === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-white p-3">
      <span className="text-sm font-medium">Вибрано: {selectedIds.length}</span>
      <span className="text-sm text-gray-500">Змінити статус:</span>
      {LOT_STATUSES.map((s) => (
        <Button
          key={s}
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => handleBulk(s)}
        >
          {LOT_STATUS_LABELS[s]}
        </Button>
      ))}
    </div>
  );
}
