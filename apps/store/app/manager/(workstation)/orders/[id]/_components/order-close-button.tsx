"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface CloseReason {
  id: string;
  code: string;
  label: string;
}

/**
 * Кнопка + модалка закриття замовлення (Етап 3 блоку Замовлення).
 *
 * Видима для не-cancelled замовлень. Modal має список причин + поле нотаток.
 * Закриває замовлення через POST /api/v1/manager/orders/{id}/close.
 */
export function OrderCloseButton({
  orderId,
  status,
  isAlreadyClosed,
}: {
  orderId: string;
  status: string;
  isAlreadyClosed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reasons, setReasons] = useState<CloseReason[]>([]);
  const [reasonId, setReasonId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || reasons.length > 0) return;
    fetch("/api/v1/manager/orders/close-reasons")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items: CloseReason[] } | null) => {
        if (d) {
          setReasons(d.items);
          if (d.items[0]) setReasonId(d.items[0].id);
        }
      })
      .catch(() => {});
  }, [open, reasons.length]);

  if (
    isAlreadyClosed ||
    status === "cancelled" ||
    status === "posted" ||
    status === "delivered"
  ) {
    return null;
  }

  async function handleClose() {
    if (!reasonId) {
      setError("Оберіть причину закриття");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manager/orders/${orderId}/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reasonId, notes: notes || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        ❌ Закрити замовлення
      </button>
      {open && (
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

            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-600">
                Коментар (опц.)
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
              />
            </label>

            {error && (
              <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                ❌ {error}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={busy || !reasonId}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Закриваю…" : "❌ Закрити"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
