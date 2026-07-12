"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Кнопка «Розпровести» (posted → draft) для редагування проведеного документа.
 * Реверсує ефекти проведення на сервері, після чого веде на сторінку
 * редагування. БЕЗ `window.confirm` (блокується в iframe) — портальний діалог.
 */
export function StockDocReopenButton({
  kind,
  id,
}: {
  kind: string;
  id: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function doReopen() {
    setConfirmOpen(false);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/manager/stock-documents/${kind}/${id}/reopen`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      router.push(`/manager/stock-documents/${kind}/${id}/edit`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirmOpen(true)}
        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
      >
        {busy ? "Розпроведення…" : "↩ Розпровести"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={() => setConfirmOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900">
              Розпровести документ?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Ефекти проведення будуть скасовані (для перепаковки — створені
              мішки видаляться, джерельні повернуться), документ стане чернеткою
              й відкриється для редагування.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={() => void doReopen()}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
              >
                Розпровести
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
