"use client";

import { useState } from "react";
import { LOT_STATUSES, LOT_STATUS_LABELS, type LotStatus } from "@ltex/shared";
import { updateLotStatus } from "./actions";

export function LotStatusForm({
  lotId,
  currentStatus,
}: {
  lotId: string;
  currentStatus: LotStatus;
}) {
  const [loading, setLoading] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as LotStatus;
    if (newStatus === currentStatus) return;
    setLoading(true);
    try {
      await updateLotStatus(lotId, newStatus);
    } finally {
      setLoading(false);
    }
  }

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      disabled={loading}
      className="rounded-md border px-2 py-1 text-xs"
    >
      {LOT_STATUSES.map((s) => (
        <option key={s} value={s}>
          {LOT_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
