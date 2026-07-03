"use client";

import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

/**
 * Спільний хук видалення менеджерського документа з ПІДТВЕРДЖЕННЯМ у власному
 * діалозі (не `window.confirm`).
 *
 * Чому не `window.confirm`/`window.alert`: менеджерка рендериться у вкладках-iframe
 * (`iframe-host`), де нативні модалки браузера можуть тихо блокуватись/ігноруватись —
 * тоді видалення «нічого не робить» без жодного вікна. Власний портальний діалог
 * працює завжди й показує серверну помилку прямо у вікні.
 *
 * Використання:
 *   const { requestDelete, dialog } = useDocDelete();
 *   ...
 *   onSelect: () => requestDelete({ endpoint: `/api/v1/manager/sales/${id}`, message: "…" })
 *   ...
 *   return (<>{table}{menu}{dialog}</>);
 */
export interface DeleteRequest {
  /** DELETE-endpoint документа. */
  endpoint: string;
  /** Текст підтвердження у діалозі. */
  message: string;
  /** Підпис кнопки-дії (за замовчуванням «Видалити»). */
  confirmLabel?: string;
}

export function useDocDelete(): {
  requestDelete: (req: DeleteRequest) => void;
  dialog: JSX.Element | null;
} {
  const router = useRouter();
  const [pending, setPending] = useState<DeleteRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const requestDelete = useCallback((req: DeleteRequest) => {
    setError(null);
    setBusy(false);
    setPending(req);
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    setPending(null);
    setError(null);
  }, [busy]);

  // Escape закриває (коли не в процесі).
  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, close]);

  const confirm = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(pending.endpoint, { method: "DELETE" });
      if (res.ok) {
        setPending(null);
        setBusy(false);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error ?? "Не вдалося видалити документ");
      setBusy(false);
    } catch {
      setError("Помилка мережі під час видалення");
      setBusy(false);
    }
  }, [pending, router]);

  const dialog =
    mounted && pending
      ? createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
            onMouseDown={close}
            role="presentation"
          >
            <div
              className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-semibold text-gray-900">
                Підтвердьте видалення
              </h2>
              <p className="mt-2 text-sm text-gray-600">{pending.message}</p>
              {error && (
                <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={busy}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? "Видалення…" : (pending.confirmLabel ?? "Видалити")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return { requestDelete, dialog };
}
