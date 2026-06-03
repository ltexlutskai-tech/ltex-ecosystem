"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Button } from "@ltex/ui";
import { ClientPicker } from "../../orders/new/_components/client-picker";
import type { ClientPickerItem } from "../../orders/new/_components/types";
import { ClosuresTable, type ClosureRow } from "./closures-table";

interface CloseResponse {
  ok?: boolean;
  closedCount?: number;
  newOrderUid?: string | null;
  newOrderNumber?: string | null;
  alreadyProcessed?: boolean;
  localOrderId?: string | null;
  error?: string;
}

interface FetchResponse {
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
    | "bookkeeper";
}) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientSummary, setClientSummary] = useState<ClientPickerItem | null>(
    null,
  );
  const [rows, setRows] = useState<ClosureRow[]>([]);
  const [addToNewOrder, setAddToNewOrder] = useState<Record<string, boolean>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    message: string;
    localOrderId: string | null;
  } | null>(null);

  const handleClientChange = useCallback(
    (id: string | null, summary: ClientPickerItem | null) => {
      setClientId(id);
      setClientSummary(summary);
      setRows([]);
      setAddToNewOrder({});
      setError(null);
      setSuccess(null);
    },
    [],
  );

  const loadClosures = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
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
      setAddToNewOrder({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const toggleAddToNew = useCallback((rowKey: string, checked: boolean) => {
    setAddToNewOrder((prev) => ({ ...prev, [rowKey]: checked }));
  }, []);

  const submitClose = useCallback(async () => {
    if (!clientId || rows.length === 0) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const items = rows.map((r) => ({
        orderUid: r.orderUid,
        productUid: r.productUid,
        quantity: r.quantity,
        price: r.quantity > 0 ? Number((r.sum / r.quantity).toFixed(2)) : r.sum,
        addToNewOrder: addToNewOrder[`${r.orderUid}::${r.productUid}`] === true,
      }));
      const res = await fetch(
        `/api/v1/manager/closures/${encodeURIComponent(clientId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        },
      );
      const json = (await res.json()) as CloseResponse;
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Помилка ${res.status}`);
        return;
      }
      const head = `Закрито ${json.closedCount ?? 0} замовлень`;
      const tail = json.newOrderNumber
        ? ` · нове замовлення ${json.newOrderNumber}`
        : "";
      setSuccess({
        message: head + tail,
        localOrderId: json.localOrderId ?? null,
      });
      // Скинути табличку — все закрито (можна повторно завантажити).
      setRows([]);
      setAddToNewOrder({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [clientId, rows, addToNewOrder]);

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

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {success.message}
          {success.localOrderId && (
            <span className="ml-2">
              <Link
                href={`/manager/orders/${success.localOrderId}`}
                className="font-medium underline"
              >
                Відкрити →
              </Link>
            </span>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-4">
          <ClosuresTable
            rows={rows}
            addToNewOrder={addToNewOrder}
            onToggleAddToNew={toggleAddToNew}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {rows.length} позицій до закриття
            </span>
            <Button
              type="button"
              onClick={submitClose}
              disabled={submitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {submitting ? "Закриваємо…" : "Закрити замовлення"}
            </Button>
          </div>
        </div>
      )}

      {!loading && rows.length === 0 && clientId && !error && !success && (
        <p className="text-sm text-gray-500">
          Натисніть «Заповнити» щоб завантажити список незакритих замовлень.
        </p>
      )}
    </div>
  );
}
