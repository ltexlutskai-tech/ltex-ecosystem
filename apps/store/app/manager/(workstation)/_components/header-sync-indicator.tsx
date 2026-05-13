"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "@ltex/ui";
import { formatRelativeShort } from "./format-relative";

export function HeaderSyncIndicator({
  initialLastSyncAt,
}: {
  initialLastSyncAt: string | null;
}) {
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(
    initialLastSyncAt ? new Date(initialLastSyncAt) : null,
  );
  const [label, setLabel] = useState(() => render(lastSyncAt));
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const id = setInterval(() => setLabel(render(lastSyncAt)), 30_000);
    return () => clearInterval(id);
  }, [lastSyncAt]);

  function render(d: Date | null): string {
    return d ? `Синхронізовано ${formatRelativeShort(d)}` : "Не синхронізовано";
  }

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setLastSyncAt(new Date());
    setLabel(render(new Date()));
    toast({
      title: "Синхронізація з 1С буде у M1.3",
      description: "Поки що це лише UI-індикатор.",
    });
    setTimeout(() => setRefreshing(false), 400);
  }

  return (
    <div className="hidden items-center gap-2 text-xs text-gray-500 lg:flex">
      <span aria-live="polite">{label}</span>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        aria-label="Оновити синхронізацію"
        className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
