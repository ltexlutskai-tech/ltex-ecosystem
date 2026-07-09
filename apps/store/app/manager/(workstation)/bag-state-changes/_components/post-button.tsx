"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Дії з карткою документа «Зміна стану мішка»: провести (draft → posted) +
 * видалити. Портальний inline-діалог замість window.confirm (блокується в
 * iframe-shell менеджерки).
 */
export function BagStatePostButton({
  id,
  canPost,
  canDelete,
}: {
  id: string;
  canPost: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "post" | "delete">(null);

  async function doPost() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manager/bag-state-changes/${id}/post`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          missingBarcodes?: string[];
        };
        setError(
          data.missingBarcodes?.length
            ? `Мішки за ШК не знайдено: ${data.missingBarcodes.join(", ")}`
            : (data.error ?? `HTTP ${res.status}`),
        );
        setBusy(false);
        setConfirm(null);
        return;
      }
      setConfirm(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manager/bag-state-changes/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        setBusy(false);
        setConfirm(null);
        return;
      }
      router.push("/manager/bag-state-changes");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {canPost && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirm("post")}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            ✅ Провести
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirm("delete")}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Видалити
          </button>
        )}
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}

      {confirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={() => setConfirm(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900">
              {confirm === "post" ? "Провести документ?" : "Видалити документ?"}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {confirm === "post"
                ? "Стан мішків буде записано, з'явиться запис у журналі історії."
                : "Документ буде видалено, записи журналу історії за ним теж."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void (confirm === "post" ? doPost() : doDelete())
                }
                className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
                  confirm === "post"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {confirm === "post" ? "Провести" : "Видалити"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
