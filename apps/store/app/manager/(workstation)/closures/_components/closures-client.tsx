"use client";

import { useCallback, useState } from "react";
import { Button } from "@ltex/ui";
import { ClientPicker } from "../../orders/new/_components/client-picker";
import type { ClientPickerItem } from "../../orders/new/_components/types";
import { ClosuresTable, type ClosureRow } from "./closures-table";

interface FetchResponse {
  ok?: boolean;
  items?: ClosureRow[];
  error?: string;
}

export function ClosuresClient({
  currentUserId,
  userRole,
}: {
  currentUserId: string;
  userRole:
    | "admin"
    | "manager"
    | "senior_manager"
    | "owner"
    | "supervisor"
    | "analyst"
    | "warehouse"
    | "expeditor"
    | "bookkeeper";
}) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientSummary, setClientSummary] = useState<ClientPickerItem | null>(
    null,
  );
  const [rows, setRows] = useState<ClosureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClientChange = useCallback(
    (id: string | null, summary: ClientPickerItem | null) => {
      setClientId(id);
      setClientSummary(summary);
      setRows([]);
      setLoaded(false);
      setError(null);
    },
    [],
  );

  const loadClosures = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    setLoaded(false);
    try {
      const res = await fetch(
        `/api/v1/manager/closures/${encodeURIComponent(clientId)}`,
      );
      const json = (await res.json()) as FetchResponse;
      if (!res.ok) {
        setError(json.error ?? `Помилка ${res.status}`);
        setRows([]);
        return;
      }
      setRows(Array.isArray(json.items) ? json.items : []);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  return (
    <div className="space-y-6">
      {/* Permission hint для адмінів. */}
      {userRole === "admin" && (
        <p className="text-xs text-gray-400">
          Доступ: admin (бачите всіх клієнтів). User id: {currentUserId}.
        </p>
      )}

      <div className="rounded-lg border bg-white p-4">
        <ClientPicker
          value={clientId}
          onChange={handleClientChange}
          initialSummary={clientSummary}
        />
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            onClick={loadClosures}
            disabled={!clientId || loading}
          >
            {loading ? "Завантаження…" : "Заповнити"}
          </Button>
          {clientSummary && !clientSummary.isOwned && (
            <span className="self-center text-xs text-amber-600">
              ⚠ Чужий клієнт — backend поверне 403.
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          <ClosuresTable rows={rows} />
          <p className="text-xs text-gray-500">
            {rows.length} позицій · Щоб закрити — відкрийте замовлення (клік по
            номеру).
          </p>
        </div>
      )}

      {!loading && loaded && rows.length === 0 && (
        <p className="text-sm text-gray-500">
          У клієнта немає незакритих замовлень.
        </p>
      )}

      {!loading && !loaded && clientId && !error && (
        <p className="text-sm text-gray-500">
          Натисніть «Заповнити» щоб завантажити незакриті замовлення клієнта.
        </p>
      )}
    </div>
  );
}
