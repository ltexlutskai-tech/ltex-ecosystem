"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus } from "lucide-react";
import {
  createDictEntry,
  updateDictEntry,
  deleteDictEntry,
} from "@/lib/manager/simple-dict-actions";
import type { DictRow } from "@/lib/manager/simple-dict-config";
import { useInlineRecordEdit } from "@/lib/autosave/use-inline-record-edit";
import { InlineAutosaveControls } from "../../../_components/inline-autosave-controls";
import { usePortalConfirm } from "../../../_components/use-portal-confirm";

const inputCls =
  "rounded-md border border-input bg-background px-3 py-1.5 text-sm";

interface DictEditFields extends Record<string, unknown> {
  label: string;
  color: string;
  active: boolean;
}

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
  const [info, setInfo] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const { confirm, dialog } = usePortalConfirm();

  // add form
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#9ca3af");

  function add() {
    if (!newLabel.trim()) return;
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.set("label", newLabel.trim());
    if (hasColor) fd.set("color", newColor);
    startTransition(async () => {
      try {
        await createDictEntry(type, fd);
        setNewLabel("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Помилка");
      }
    });
  }

  function remove(id: string, label: string) {
    confirm({
      title: "Видалити значення з довідника?",
      message: `«${label}» буде прибрано зі списків вибору. Якщо значення вже використовується або належить 1С — його заархівуємо (історія збережеться), а не зітремо.`,
      destructive: true,
      confirmLabel: "Видалити",
      onConfirm: async () => {
        setError(null);
        setInfo(null);
        try {
          const res = await deleteDictEntry(type, id);
          if (res.archived) {
            setInfo(
              "Значення використовується або належить 1С — його заархівовано (сховано зі списків вибору), а не стерто. Історія збережена.",
            );
          }
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Помилка");
        }
      },
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {info && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {info}
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
                      <EditableDictRow
                        type={type}
                        row={row}
                        hasColor={hasColor}
                        isRoute={isRoute}
                        onDone={() => {
                          setEditId(null);
                          router.refresh();
                        }}
                      />
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
                              onClick={() => setEditId(row.id)}
                              className="rounded p-1 text-gray-400 hover:text-blue-600"
                              aria-label="Редагувати"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(row.id, row.label)}
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

      {dialog}
    </div>
  );
}

/**
 * Рядок довідника у режимі редагування: будь-яка зміна поля автозберігається
 * одразу (без кнопки «Зберегти») через server action `updateDictEntry`.
 */
function EditableDictRow({
  type,
  row,
  hasColor,
  isRoute,
  onDone,
}: {
  type: string;
  row: DictRow;
  hasColor: boolean;
  isRoute: boolean;
  onDone: () => void;
}) {
  const edit = useInlineRecordEdit<DictEditFields>({
    recordKey: `dict:${type}:${row.id}`,
    initial: {
      label: row.label,
      color: row.color ?? "#9ca3af",
      active: row.active ?? true,
    },
    save: async (data) => {
      const label = data.label.trim();
      if (!label) throw new Error("Вкажіть назву");
      const fd = new FormData();
      fd.set("label", label);
      if (hasColor) fd.set("color", data.color);
      if (isRoute) fd.set("active", String(data.active));
      await updateDictEntry(type, row.id, fd);
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {hasColor && (
          <input
            type="color"
            value={edit.fields.color}
            onChange={(e) => edit.setField("color", e.target.value)}
            className="h-8 w-10 rounded border"
          />
        )}
        <input
          value={edit.fields.label}
          onChange={(e) => edit.setField("label", e.target.value)}
          className={`${inputCls} min-w-[220px] flex-1`}
          autoFocus
        />
        {isRoute && (
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={edit.fields.active}
              onChange={(e) => edit.setField("active", e.target.checked)}
            />
            Активний
          </label>
        )}
      </div>
      <InlineAutosaveControls
        status={edit.status}
        savedAt={edit.savedAt}
        hasRestore={edit.hasRestore}
        onApplyRestore={edit.applyRestore}
        onDismissRestore={edit.dismissRestore}
        onDone={() => {
          void edit.flush().finally(onDone);
        }}
      />
    </div>
  );
}
