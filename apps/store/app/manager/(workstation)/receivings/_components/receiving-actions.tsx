"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Кнопки дій для документа поступлення (правки 2026-06-04):
 * `draft`     → ✅ Провести (admin/owner) / 🗑 Видалити (warehouse може свій)
 * `posted`    → ⨯ Скасувати (admin/owner)
 * `cancelled` → (немає дій)
 *
 * Узгоджено user: warehouse зберігає чернетки, admin/owner перевіряє і
 * проводить (аналогічно як у 1С: документ спочатку «не проведений» →
 * відповідальна особа перевіряє → проводить).
 */
export function ReceivingActions({
  id,
  status,
  canPost,
  canDeleteDraft,
  canCancel,
}: {
  id: string;
  status: string;
  canPost: boolean;
  canDeleteDraft: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePost() {
    if (!confirm("Провести документ? Це створить лоти у Прайсі.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/manager/warehouse/receivings/${id}/post`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Видалити цей draft назавжди?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/warehouse/receivings/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      router.push("/manager/receivings");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setBusy(false);
    }
  }

  async function handleCancel() {
    const reason = prompt("Причина скасування проведеного документа:", "");
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/manager/warehouse/receivings/${id}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {status === "draft" && (
          <a
            href={`/manager/receivings/${id}/edit`}
            className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
          >
            ✏ Редагувати
          </a>
        )}
        {status === "draft" && canPost && (
          <button
            type="button"
            onClick={handlePost}
            disabled={busy}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            ✅ Провести
          </button>
        )}
        {status === "draft" && canDeleteDraft && (
          <>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              🗑 Видалити
            </button>
          </>
        )}
        {status === "posted" && canCancel && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-50 disabled:opacity-50"
          >
            ⨯ Скасувати проведення
          </button>
        )}
      </div>
      {error && <div className="text-xs text-red-700">{error}</div>}
    </div>
  );
}
