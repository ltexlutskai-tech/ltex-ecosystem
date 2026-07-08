"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@ltex/ui";
import { ClientPicker } from "../../orders/new/_components/client-picker";
import type { ClientPickerItem } from "../../orders/new/_components/types";
import { openManagerTab } from "../../_components/open-manager-tab";
import { ClosuresTable, itemKey, type ClosureOrder } from "./closures-table";

interface FetchResponse {
  ok?: boolean;
  orders?: ClosureOrder[];
  error?: string;
}

interface CloseReason {
  id: string;
  code: string;
  label: string;
}

export function ClosuresClient({
  userRole,
  initialClientId,
  initialClientSummary,
}: {
  userRole: string;
  /** MgrClient.id — коли прийшли з картки замовлення (?clientId=...). */
  initialClientId?: string | null;
  initialClientSummary?: ClientPickerItem | null;
}) {
  const [clientId, setClientId] = useState<string | null>(
    initialClientId ?? null,
  );
  const [clientSummary, setClientSummary] = useState<ClientPickerItem | null>(
    initialClientSummary ?? null,
  );
  const [orders, setOrders] = useState<ClosureOrder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Закриття замовлення: причина + який документ закриваємо.
  const [reasons, setReasons] = useState<CloseReason[]>([]);
  const [closeFor, setCloseFor] = useState<string | null>(null);
  const [reasonId, setReasonId] = useState("");
  const [closing, setClosing] = useState<string | null>(null);
  const autoLoadedRef = useRef(false);

  const loadClosures = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setLoaded(false);
    try {
      const res = await fetch(
        `/api/v1/manager/closures/${encodeURIComponent(id)}`,
      );
      const json = (await res.json()) as FetchResponse;
      if (!res.ok) {
        setError(json.error ?? `Помилка ${res.status}`);
        setOrders([]);
        return;
      }
      setOrders(Array.isArray(json.orders) ? json.orders : []);
      setSelected(new Set());
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Прийшли з картки замовлення (?clientId) — вантажимо одразу.
  useEffect(() => {
    if (autoLoadedRef.current) return;
    if (initialClientId) {
      autoLoadedRef.current = true;
      void loadClosures(initialClientId);
    }
  }, [initialClientId, loadClosures]);

  // Довідник причин закриття — один раз.
  useEffect(() => {
    fetch("/api/v1/manager/orders/close-reasons")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items: CloseReason[] } | null) => {
        if (d?.items) {
          setReasons(d.items);
          if (d.items[0]) setReasonId(d.items[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const handleClientChange = useCallback(
    (id: string | null, summary: ClientPickerItem | null) => {
      setClientId(id);
      setClientSummary(summary);
      setOrders([]);
      setSelected(new Set());
      setLoaded(false);
      setError(null);
    },
    [],
  );

  function toggleItem(orderUid: string, productUid: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = itemKey(orderUid, productUid);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleOrder(order: ClosureOrder): void {
    setSelected((prev) => {
      const next = new Set(prev);
      const keys = order.items.map((it) =>
        itemKey(order.orderUid, it.productUid),
      );
      const allChecked = keys.every((k) => next.has(k));
      for (const k of keys) {
        if (allChecked) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }

  async function confirmClose(): Promise<void> {
    if (!closeFor || !reasonId) return;
    setClosing(closeFor);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manager/orders/${closeFor}/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reasonId }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? `Помилка ${res.status}`);
        return;
      }
      setCloseFor(null);
      // Прибираємо закрите замовлення зі списку.
      setOrders((prev) => prev.filter((o) => o.orderUid !== closeFor));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const k of [...next]) {
          if (k.startsWith(`${closeFor}::`)) next.delete(k);
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setClosing(null);
    }
  }

  function createOrderFromSelected(): void {
    if (selected.size === 0) return;
    // carry=<orderUid:productUid,...> — нова сторінка замовлення відновить
    // позиції з БД і підтягне клієнта.
    const carry = [...selected].map((k) => k.replace("::", ":")).join(",");
    openManagerTab(
      `/manager/orders/new?carry=${encodeURIComponent(carry)}`,
      "Нове замовлення",
    );
  }

  const cameFromOrder = !!initialClientId;

  return (
    <div className="space-y-6">
      {/* Пікер клієнта показуємо лише коли НЕ прийшли з картки замовлення. */}
      {!cameFromOrder && (
        <div className="rounded-lg border bg-white p-4">
          <ClientPicker
            value={clientId}
            onChange={handleClientChange}
            initialSummary={clientSummary}
          />
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              onClick={() => clientId && loadClosures(clientId)}
              disabled={!clientId || loading}
            >
              {loading ? "Завантаження…" : "Заповнити"}
            </Button>
          </div>
        </div>
      )}

      {cameFromOrder && clientSummary && (
        <div className="rounded-lg border bg-white p-3 text-sm">
          Контрагент: <strong>{clientSummary.name}</strong>
          {clientSummary.city ? ` · ${clientSummary.city}` : ""}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {orders.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              Відмітьте позиції, які треба перенести в нове замовлення, потім
              закрийте старі документи.
            </p>
            <Button
              type="button"
              onClick={createOrderFromSelected}
              disabled={selected.size === 0}
            >
              Створити нове замовлення з відмічених ({selected.size})
            </Button>
          </div>
          <ClosuresTable
            orders={orders}
            selected={selected}
            onToggleItem={toggleItem}
            onToggleOrder={toggleOrder}
            onCloseOrder={setCloseFor}
            closingOrderId={closing}
          />
        </>
      )}

      {!loading && loaded && orders.length === 0 && (
        <p className="text-sm text-gray-500">
          У клієнта немає незакритих замовлень.
        </p>
      )}

      {/* Модалка вибору причини закриття. */}
      {closeFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <h3 className="text-lg font-semibold">Закрити замовлення</h3>
            <p className="mt-1 text-sm text-gray-500">
              Виберіть причину. Замовлення стане недоступним для редагування.
            </p>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-600">
                Причина *
              </span>
              <select
                value={reasonId}
                onChange={(e) => setReasonId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
              >
                <option value="">— Оберіть —</option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCloseFor(null)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={confirmClose}
                disabled={!reasonId || closing !== null}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {closing ? "Закриваю…" : "❌ Закрити"}
              </button>
            </div>
          </div>
        </div>
      )}

      {userRole === "admin" && orders.length === 0 && !loading && !loaded && (
        <p className="text-xs text-gray-400">
          Оберіть контрагента та натисніть «Заповнити».
        </p>
      )}
    </div>
  );
}
