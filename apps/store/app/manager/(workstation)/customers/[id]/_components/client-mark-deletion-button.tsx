"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useToast } from "@ltex/ui";

/**
 * Кнопка «Позначити на вилучення» у картці клієнта (ТЗ 8.0 B5).
 *
 * Звичайний користувач не може фізично видалити клієнта — лише позначити на
 * вилучення з обовʼязковою причиною. Після позначення клієнт зникає зі списків
 * користувача, а адміністратор отримує завдання у черзі `/manager/admin/deletions`.
 *
 * Діалог — власний портальний (не `window.confirm`), бо менеджерка рендериться
 * у вкладках-iframe, де нативні модалки браузера тихо ігноруються.
 */
export function ClientMarkDeletionButton({
  clientId,
  renderTrigger,
}: {
  clientId: string;
  /**
   * Кастомний тригер (напр. рядок у меню «⋮»). Отримує `open` — виклик відкриває
   * діалог підтвердження. Якщо не задано — показуємо дефолтну іконку-кошик.
   */
  renderTrigger?: (open: () => void) => ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
    setReason("");
    setError(null);
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const reasonValid = reason.trim().length >= 3;

  const submit = useCallback(async () => {
    if (!reasonValid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/manager/deletions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "client",
          entityId: clientId,
          reason: reason.trim(),
        }),
      });
      if (res.ok) {
        setOpen(false);
        setBusy(false);
        toast({
          description:
            "Позначено на вилучення. Остаточне рішення прийме адміністратор.",
        });
        router.push("/manager/customers");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error ?? "Не вдалося позначити на вилучення");
      setBusy(false);
    } catch {
      setError("Помилка мережі");
      setBusy(false);
    }
  }, [reasonValid, clientId, reason, toast, router]);

  const dialog =
    mounted && open
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
                Позначити клієнта на вилучення?
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Клієнт зникне з ваших списків. Остаточне рішення (видалити чи
                повернути) прийме адміністратор. Вкажіть причину:
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                autoFocus
                placeholder="Наприклад: дублікат, помилковий запис, більше не працюємо…"
                className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
              />
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
                  onClick={() => void submit()}
                  disabled={busy || !reasonValid}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? "Позначення…" : "Позначити"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Позначити на вилучення"
          aria-label="Позначити на вилучення"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      {dialog}
    </>
  );
}
