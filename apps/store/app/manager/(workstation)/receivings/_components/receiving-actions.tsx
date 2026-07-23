"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePortalConfirm } from "../../_components/use-portal-confirm";

/**
 * Кнопки дій для документа поступлення (правки 2026-06-04):
 * `draft`     → ✅ Провести (admin/owner) / 🗑 Видалити (warehouse може свій)
 * `posted`    → ⨯ Скасувати (admin/owner)
 * `cancelled` → (немає дій)
 *
 * ⚠️ Менеджерка живе у вкладках-iframe, де `window.confirm`/`prompt` ТИХО
 * ігноруються — тому раніше «Видалити»/«Провести» нічого не робили. Тепер усі
 * підтвердження — через портальний діалог (`usePortalConfirm`), а причина
 * скасування — через власний портальний діалог із полем.
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
  const { confirm, dialog } = usePortalConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  function handlePost() {
    confirm({
      title: "Провести документ?",
      message: "Це створить лоти у Прайсі.",
      confirmLabel: "Провести",
      onConfirm: async () => {
        setError(null);
        const res = await fetch(
          `/api/v1/manager/warehouse/receivings/${id}/post`,
          { method: "POST" },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(data.error ?? `HTTP ${res.status}`);
          return;
        }
        router.refresh();
      },
    });
  }

  function handleDelete() {
    confirm({
      title: "Видалити чернетку?",
      message: "Документ буде видалено назавжди.",
      destructive: true,
      confirmLabel: "Видалити",
      onConfirm: async () => {
        setError(null);
        const res = await fetch(`/api/v1/manager/warehouse/receivings/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(data.error ?? `HTTP ${res.status}`);
          return;
        }
        router.push("/manager/receivings");
      },
    });
  }

  function handleReopen() {
    confirm({
      title: "Розпровести документ?",
      message:
        "Створені лоти буде видалено, документ повернеться у чернетку. Дані рядків залишаться.",
      destructive: true,
      confirmLabel: "Розпровести",
      onConfirm: async () => {
        setError(null);
        const res = await fetch(
          `/api/v1/manager/warehouse/receivings/${id}/reopen`,
          { method: "POST" },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(data.error ?? `HTTP ${res.status}`);
          return;
        }
        router.push(`/manager/receivings/${id}/edit`);
      },
    });
  }

  async function submitCancel(reason: string) {
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
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setCancelOpen(false);
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
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            🗑 Видалити
          </button>
        )}
        {status === "posted" && canCancel && (
          <>
            <button
              type="button"
              onClick={handleReopen}
              disabled={busy}
              className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
              title="Повернути у чернетку для редагування"
            >
              ↩ Розпровести
            </button>
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              disabled={busy}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-50 disabled:opacity-50"
            >
              ⨯ Скасувати проведення
            </button>
          </>
        )}
      </div>
      {error && <div className="text-xs text-red-700">{error}</div>}

      {dialog}
      {cancelOpen && (
        <CancelReasonDialog
          busy={busy}
          onClose={() => setCancelOpen(false)}
          onSubmit={submitCancel}
        />
      )}
    </div>
  );
}

/** Портальний діалог із причиною скасування проведеного поступлення. */
function CancelReasonDialog({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={() => !busy && onClose()}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900">
          Скасувати проведення?
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Вкажіть причину скасування (мін. 3 символи).
        </p>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder="Причина…"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Ні
          </button>
          <button
            type="button"
            onClick={() => onSubmit(reason)}
            disabled={busy || reason.trim().length < 3}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? "Зачекайте…" : "Скасувати проведення"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
