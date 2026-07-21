"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@ltex/ui";
import { CLIENT_COLOR_META } from "@/lib/manager/client-color";
import type { SerializedBulkField } from "@/lib/manager/bulk-edit/registry";
import { SortableHeader } from "../../_components/sortable-header";
import { BulkFieldDialog } from "../../_components/bulk/bulk-field-dialog";
import { renderCell } from "../_lib/column-render";
import { COLUMN_LABELS } from "../_lib/filter-labels";
import { SORTABLE_COLUMN_KEYS } from "../_lib/sortable-columns";
import type { ClientListItem, ConfigItem } from "./types";

export interface BulkManagerOption {
  id: string;
  fullName: string;
  email: string;
}

/**
 * Список клієнтів із можливістю групової зміни менеджера (лише admin).
 * Додає колонку-чекбокс + «вибрати всі на сторінці» та липку панель дій унизу.
 * Одинична зміна менеджера лишається у картці клієнта.
 */
export function ClientListBulk({
  items,
  columnsPrefs,
  managers,
  bulkFields,
}: {
  items: ClientListItem[];
  columnsPrefs: ConfigItem[];
  managers: BulkManagerOption[];
  /** Поля «Групової обробки» (масова зміна довідникових полів). */
  bulkFields?: SerializedBulkField[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [managerId, setManagerId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkEnabled = (bulkFields?.length ?? 0) > 0;

  const visibleCols = useMemo(
    () =>
      columnsPrefs.filter((c) => c.visible).sort((a, b) => a.order - b.order),
    [columnsPrefs],
  );

  const allOnPageSelected =
    items.length > 0 && items.every((c) => selected.has(c.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (items.every((c) => prev.has(c.id))) {
        const next = new Set(prev);
        for (const c of items) next.delete(c.id);
        return next;
      }
      const next = new Set(prev);
      for (const c of items) next.add(c.id);
      return next;
    });
  }

  function clear() {
    setSelected(new Set());
    setManagerId("");
  }

  async function apply() {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/manager/clients/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          clientIds: Array.from(selected),
          userId: managerId === "" ? null : managerId,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка групової зміни",
          variant: "destructive",
        });
        return;
      }
      const data = (await res.json()) as { updated: number };
      toast({ description: `Менеджера змінено для ${data.updated} клієнтів` });
      clear();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-12 text-center text-sm text-gray-500">
        Клієнтів не знайдено за вибраними фільтрами.
      </div>
    );
  }

  if (visibleCols.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-12 text-center text-sm text-gray-500">
        Не вибрано жодної колонки. Натисніть &quot;Налаштування&quot; щоб
        увімкнути колонки.
      </div>
    );
  }

  return (
    <>
      <div className="max-h-[calc(100vh-15rem)] overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs tracking-wide text-gray-500 uppercase shadow-sm">
            <tr>
              <th className="w-8 bg-gray-50 px-2.5 py-1.5">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAll}
                  aria-label="Вибрати всіх на сторінці"
                />
              </th>
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className="bg-gray-50 px-2.5 py-1.5 whitespace-nowrap"
                >
                  {SORTABLE_COLUMN_KEYS.has(col.key) ? (
                    <SortableHeader
                      sortKey={col.key}
                      label={COLUMN_LABELS[col.key] ?? col.key}
                    />
                  ) : (
                    (COLUMN_LABELS[col.key] ?? col.key)
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((c) => {
              const tint = CLIENT_COLOR_META[c.color].rowClass;
              const isSelected = selected.has(c.id);
              return (
                <tr
                  key={c.id}
                  className={
                    isSelected
                      ? "bg-blue-100"
                      : tint
                        ? `${tint} hover:brightness-95`
                        : "hover:bg-gray-50"
                  }
                >
                  <td className="px-2.5 py-1.5 align-top">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(c.id)}
                      aria-label={`Обрати ${c.name}`}
                    />
                  </td>
                  {visibleCols.map((col) => (
                    <td
                      key={col.key}
                      className="px-2.5 py-1.5 align-top text-gray-800"
                    >
                      {renderCell(col.key, c)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-3 z-10 mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-2.5 shadow-lg">
          <span className="text-sm font-medium text-gray-700">
            Обрано: {selected.size}
          </span>
          <select
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            className="rounded-md border bg-white px-3 py-1.5 text-sm"
          >
            <option value="">— Зняти прив&apos;язку —</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName} ({m.email})
              </option>
            ))}
          </select>
          <Button type="button" size="sm" onClick={apply} disabled={submitting}>
            {submitting ? "Збереження…" : "Змінити менеджера"}
          </Button>
          {bulkEnabled && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setBulkOpen(true)}
              disabled={submitting}
            >
              Групова обробка
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clear}
            disabled={submitting}
          >
            Скасувати
          </Button>
        </div>
      )}

      {bulkEnabled && (
        <BulkFieldDialog
          entity="client"
          fields={bulkFields ?? []}
          ids={Array.from(selected)}
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            clear();
          }}
        />
      )}
    </>
  );
}
