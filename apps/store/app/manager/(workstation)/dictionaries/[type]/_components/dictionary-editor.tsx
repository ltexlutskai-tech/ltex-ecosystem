"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X, Plus } from "lucide-react";
import {
  createDictEntry,
  updateDictEntry,
  deleteDictEntry,
} from "@/lib/manager/simple-dict-actions";
import type { DictRow } from "@/lib/manager/simple-dict-config";

const inputCls =
  "rounded-md border border-input bg-background px-3 py-1.5 text-sm";

export function DictionaryEditor({
  type,
  rows,
  hasColor,
  isRoute,
  canEdit,
}: {
  type: string;
  rows: DictRow[];
  hasColor: boolean;
  isRoute: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  // add form
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#9ca3af");
  // edit form
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState("#9ca3af");
  const [editActive, setEditActive] = useState(true);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Помилка");
      }
    });
  }

  function add() {
    if (!newLabel.trim()) return;
    const fd = new FormData();
    fd.set("label", newLabel.trim());
    if (hasColor) fd.set("color", newColor);
    run(() => createDictEntry(type, fd));
    setNewLabel("");
  }

  function startEdit(row: DictRow) {
    setEditId(row.id);
    setEditLabel(row.label);
    setEditColor(row.color ?? "#9ca3af");
    setEditActive(row.active ?? true);
  }

  function saveEdit(id: string) {
    const fd = new FormData();
    fd.set("label", editLabel.trim());
    if (hasColor) fd.set("color", editColor);
    if (isRoute) fd.set("active", String(editActive));
    run(() => updateDictEntry(type, id, fd));
    setEditId(null);
  }

  function remove(id: string) {
    if (!window.confirm("Видалити значення з довідника?")) return;
    run(() => deleteDictEntry(type, id));
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3">
          {hasColor && (
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-9 w-10 rounded border"
              aria-label="Колір"
            />
          )}
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Нове значення…"
            className={`${inputCls} min-w-[220px] flex-1`}
          />
          <button
            type="button"
            onClick={add}
            disabled={pending || !newLabel.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Додати
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-gray-400">Порожньо.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b last:border-b-0">
                  {editId === row.id ? (
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {hasColor && (
                          <input
                            type="color"
                            value={editColor}
                            onChange={(e) => setEditColor(e.target.value)}
                            className="h-8 w-10 rounded border"
                          />
                        )}
                        <input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className={`${inputCls} min-w-[220px] flex-1`}
                        />
                        {isRoute && (
                          <label className="flex items-center gap-1.5 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={editActive}
                              onChange={(e) => setEditActive(e.target.checked)}
                            />
                            Активний
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={() => saveEdit(row.id)}
                          disabled={pending}
                          className="rounded-md bg-green-600 p-1.5 text-white hover:bg-green-700"
                          aria-label="Зберегти"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditId(null)}
                          className="rounded-md border p-1.5 text-gray-500 hover:bg-gray-50"
                          aria-label="Скасувати"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  ) : (
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-gray-800">
                          {hasColor && row.color && (
                            <span
                              className="inline-block h-3 w-3 rounded-full border"
                              style={{ backgroundColor: row.color }}
                            />
                          )}
                          {row.label}
                          {isRoute && row.active === false && (
                            <span className="rounded bg-gray-100 px-1.5 text-xs text-gray-500">
                              неактивний
                            </span>
                          )}
                        </span>
                        {canEdit && (
                          <span className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="rounded p-1 text-gray-400 hover:text-blue-600"
                              aria-label="Редагувати"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(row.id)}
                              className="rounded p-1 text-gray-400 hover:text-red-600"
                              aria-label="Видалити"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
