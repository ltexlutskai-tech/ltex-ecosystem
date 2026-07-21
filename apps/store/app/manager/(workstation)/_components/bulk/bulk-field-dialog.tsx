"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useToast } from "@ltex/ui";
import type { SerializedBulkField } from "@/lib/manager/bulk-edit/registry";

/**
 * Портальний діалог «Групової обробки»: вибрати поле (лише дозволені ролі —
 * приходять серіалізованими без реального стовпця), задати значення за типом
 * поля, застосувати до N обраних обʼєктів. Підтвердження inline — БЕЗ
 * `window.confirm` (менеджерка живе в iframe-вкладці).
 */
export function BulkFieldDialog({
  entity,
  fields,
  ids,
  open,
  onClose,
  onDone,
}: {
  entity: string;
  fields: SerializedBulkField[];
  ids: string[];
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [fieldKey, setFieldKey] = useState<string>(fields[0]?.key ?? "");
  const [value, setValue] = useState<string | boolean | null>("");
  const [clearMode, setClearMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  const field = useMemo(
    () => fields.find((f) => f.key === fieldKey) ?? null,
    [fields, fieldKey],
  );

  // Скидаємо значення при зміні поля (і при кожному відкритті).
  useEffect(() => {
    if (!open) return;
    setError(null);
    setClearMode(false);
    if (!field) {
      setValue("");
      return;
    }
    if (field.type === "boolean") setValue(true);
    else if (field.type === "enum" || field.type === "category")
      setValue(field.options?.[0]?.value ?? "");
    else setValue("");
  }, [field, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  async function apply() {
    if (!field || ids.length === 0) return;
    setBusy(true);
    setError(null);
    const payloadValue = clearMode && field.nullable ? null : value;
    try {
      const res = await fetch("/api/v1/manager/bulk-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          entity,
          fieldKey: field.key,
          value: payloadValue,
          ids,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Не вдалося застосувати зміни");
        setBusy(false);
        return;
      }
      const data = (await res.json()) as { updated: number };
      toast({ description: `Змінено обʼєктів: ${data.updated}` });
      setBusy(false);
      onDone();
      router.refresh();
    } catch {
      setError("Помилка мережі");
      setBusy(false);
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900">
          Групова обробка
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Обрано обʼєктів: {ids.length}. Оберіть поле та нове значення.
        </p>

        {fields.length === 0 ? (
          <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Немає полів, доступних для масової зміни.
          </p>
        ) : (
          <>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Поле
              <select
                value={fieldKey}
                onChange={(e) => setFieldKey(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {fields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            {field && (
              <div className="mt-3">
                <span className="block text-sm font-medium text-gray-700">
                  Нове значення
                </span>
                {field.nullable && (
                  <label className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={clearMode}
                      onChange={(e) => setClearMode(e.target.checked)}
                    />
                    Очистити значення (—)
                  </label>
                )}

                {!clearMode && field.type === "boolean" && (
                  <select
                    value={value === true ? "true" : "false"}
                    onChange={(e) => setValue(e.target.value === "true")}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="true">Так</option>
                    <option value="false">Ні</option>
                  </select>
                )}

                {!clearMode &&
                  (field.type === "enum" || field.type === "category") && (
                    <select
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => setValue(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      {(field.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}

                {!clearMode && field.type === "text" && (
                  <>
                    <input
                      type="text"
                      value={typeof value === "string" ? value : ""}
                      maxLength={field.maxLength}
                      list={
                        field.options && field.options.length > 0
                          ? `bulk-field-${field.key}`
                          : undefined
                      }
                      onChange={(e) => setValue(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                    {field.options && field.options.length > 0 && (
                      <datalist id={`bulk-field-${field.key}`}>
                        {field.options.map((o) => (
                          <option key={o.value} value={o.value} />
                        ))}
                      </datalist>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {error && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={() => void apply()}
            disabled={busy || !field || ids.length === 0}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {busy ? "Застосування…" : `Застосувати до ${ids.length}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
