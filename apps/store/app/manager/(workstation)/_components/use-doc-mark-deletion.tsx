"use client";

import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useToast } from "@ltex/ui";
import { notifyPendingBadges } from "./notify-pending-badges";

/**
 * Спільний хук ПОЗНАЧЕННЯ менеджерського документа НА ВИЛУЧЕННЯ (ТЗ 8.0 B6).
 *
 * На відміну від прямого DELETE (`use-doc-delete` — прибрано), менеджер більше
 * не видаляє документ фізично. Він лише позначає його на вилучення з обовʼязковою
 * причиною; остаточне рішення (стерти чи повернути) приймає адміністратор у черзі
 * `/manager/admin/deletions`. Позначений документ одразу зникає зі списків.
 *
 * Діалог — власний портальний (не `window.confirm`), бо менеджерка рендериться
 * у вкладках-iframe, де нативні модалки браузера тихо ігноруються.
 *
 * Використання:
 *   const { requestMark, dialog } = useDocMarkDeletion();
 *   ...
 *   onSelect: () => requestMark({
 *     entityType: "sale", entityId: id, message: "…контекст…",
 *   })
 *   ...
 *   return (<>{table}{menu}{dialog}</>);
 */
export type MarkDeletionEntityType =
  | "order"
  | "sale"
  | "cash_order"
  | "route_sheet";

export interface MarkDeletionRequest {
  /** Тип документа для черги вилучення. */
  entityType: MarkDeletionEntityType;
  /** ID документа. */
  entityId: string;
  /** Пояснення у діалозі (що саме позначається). */
  message: string;
}

/**
 * Стандартні причини вилучення (щоб не набирати щоразу вручну). Вибір із
 * списку одразу заповнює редаговане поле — за потреби причину можна дописати.
 */
const STANDARD_DELETION_REASONS = [
  "Дублікат документа",
  "Помилковий запис",
  "Створено помилково",
  "Тестовий запис",
  "Скасовано клієнтом",
  "Неактуальне / застаріле",
] as const;

export function useDocMarkDeletion(): {
  requestMark: (req: MarkDeletionRequest) => void;
  dialog: JSX.Element | null;
} {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<MarkDeletionRequest | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const requestMark = useCallback((req: MarkDeletionRequest) => {
    setError(null);
    setBusy(false);
    setReason("");
    setPending(req);
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    setPending(null);
    setReason("");
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

  const reasonValid = reason.trim().length >= 3;

  const submit = useCallback(async () => {
    if (!pending || !reasonValid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/manager/deletions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: pending.entityType,
          entityId: pending.entityId,
          reason: reason.trim(),
        }),
      });
      if (res.ok) {
        setPending(null);
        setBusy(false);
        setReason("");
        toast({
          description:
            "Позначено на вилучення. Рухи оновлено; повернути можна з «Кошика».",
        });
        notifyPendingBadges();
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
  }, [pending, reasonValid, reason, toast, router]);

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
                Позначити документ на вилучення?
              </h2>
              <p className="mt-2 text-sm text-gray-600">{pending.message}</p>
              <p className="mt-2 text-sm text-gray-600">
                Рухи по регістрах (борг/каса/склад) оновляться одразу, документ
                зникне зі списків. Повернути можна з «Кошика», поки
                адміністратор не підтвердив остаточне видалення. Вкажіть
                причину:
              </p>
              <select
                value={
                  (STANDARD_DELETION_REASONS as readonly string[]).includes(
                    reason,
                  )
                    ? reason
                    : ""
                }
                onChange={(e) => {
                  if (e.target.value) setReason(e.target.value);
                }}
                aria-label="Оберіть стандартну причину"
                className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
              >
                <option value="">— Оберіть причину зі списку —</option>
                {STANDARD_DELETION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                autoFocus
                placeholder="Або впишіть свою причину (можна дописати до обраної)…"
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
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
                  {busy ? "Позначення…" : "Позначити на вилучення"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return { requestMark, dialog };
}
