"use client";

import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Портальний діалог підтвердження (заміна `window.confirm`).
 *
 * Менеджерка рендериться у вкладках-iframe, де нативні `window.confirm`/`alert`
 * тихо ігноруються — тож для підтверджень потрібен власний портальний діалог.
 *
 * Використання:
 *   const { confirm, dialog } = usePortalConfirm();
 *   ...
 *   onClick: () => confirm({
 *     title: "Видалити значення?",
 *     message: "…",
 *     destructive: true,
 *     onConfirm: async () => { await doDelete(); },
 *   })
 *   ...
 *   return (<>{content}{dialog}</>);
 */
export interface PortalConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function usePortalConfirm(): {
  confirm: (req: PortalConfirmRequest) => void;
  dialog: JSX.Element | null;
} {
  const [pending, setPending] = useState<PortalConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const confirm = useCallback((req: PortalConfirmRequest) => {
    setBusy(false);
    setPending(req);
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    setPending(null);
  }, [busy]);

  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, close]);

  const run = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.onConfirm();
      setPending(null);
    } finally {
      setBusy(false);
    }
  }, [pending]);

  const destructive = pending?.destructive ?? false;

  const dialog =
    mounted && pending
      ? createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
            onMouseDown={close}
            role="presentation"
          >
            <div
              className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-semibold text-gray-900">
                {pending.title}
              </h2>
              {pending.message && (
                <p className="mt-2 text-sm text-gray-600">{pending.message}</p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {pending.cancelLabel ?? "Скасувати"}
                </button>
                <button
                  type="button"
                  onClick={() => void run()}
                  disabled={busy}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
                    destructive
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {busy
                    ? "Зачекайте…"
                    : (pending.confirmLabel ?? "Підтвердити")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return { confirm, dialog };
}
