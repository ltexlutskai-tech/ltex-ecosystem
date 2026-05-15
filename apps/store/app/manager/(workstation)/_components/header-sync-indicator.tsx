"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { formatRelativeShort } from "./format-relative";

interface SyncStatus {
  pendingCount: number;
  retryingCount: number;
  failedCount: number;
  queuedCount: number;
  lastSentAt: string | null;
}

const POLL_INTERVAL_MS = 30_000;

export function HeaderSyncIndicator(_props: {
  initialLastSyncAt: string | null;
}) {
  void _props; // backward-compat з layout.tsx; реальний state — з /api/sync/status
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/v1/manager/sync/status", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as SyncStatus;
      setStatus(body);
    } catch {
      // тиха помилка — індикатор просто не оновиться
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  async function handleRefresh(): Promise<void> {
    if (refreshing) return;
    setRefreshing(true);
    await fetchStatus();
    setTimeout(() => setRefreshing(false), 400);
  }

  return (
    <div className="hidden items-center gap-2 text-xs lg:flex">
      <span aria-live="polite" className={labelColor(status)}>
        {renderLabel(status)}
      </span>
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

function renderLabel(status: SyncStatus | null): string {
  if (!status) return "Завантаження…";
  if (status.failedCount > 0) {
    return `⚠ ${status.failedCount} не вдалось`;
  }
  if (status.queuedCount > 0) {
    return `⏳ ${status.queuedCount} у черзі`;
  }
  if (status.lastSentAt) {
    return `Синхронізовано ${formatRelativeShort(new Date(status.lastSentAt))}`;
  }
  return "Без даних";
}

function labelColor(status: SyncStatus | null): string {
  if (!status) return "text-gray-500";
  if (status.failedCount > 0) return "text-red-600";
  if (status.queuedCount > 0) return "text-amber-600";
  if (status.lastSentAt) return "text-green-600";
  return "text-gray-500";
}
