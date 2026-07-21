"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { SerializedBulkField } from "@/lib/manager/bulk-edit/registry";
import { OrdersRow, type OrdersRowData } from "./orders-row";
import { SortableHeader } from "../../_components/sortable-header";
import { useBulkSelection } from "../../_components/bulk/use-bulk-selection";
import { BulkProcessingBar } from "../../_components/bulk/bulk-processing-bar";
import { BulkFieldDialog } from "../../_components/bulk/bulk-field-dialog";
import { useListContextMenu } from "../../_components/use-list-context-menu";
import { useDocMarkDeletion } from "../../_components/use-doc-mark-deletion";
import type { ContextMenuItem } from "../../_components/list-context-menu";
import type { MenuContext } from "../../_components/use-list-context-menu";

/**
 * Мапа `data-col` → ключ сортування / URL-параметр фільтра «відбору».
 * Нові колонки додаються тут.
 */
const COLS: Record<string, { sortKey?: string; filterParam?: string }> = {
  code: { sortKey: "code" },
  client: { sortKey: "client", filterParam: "clientName" },
  city: { sortKey: "city", filterParam: "city" },
  region: {},
  date: { sortKey: "date" },
  status: { sortKey: "status" },
  actual: { sortKey: "actual" },
  agent: { sortKey: "agent", filterParam: "agent" },
  positions: { sortKey: "positions" },
  sum: { sortKey: "sum" },
};

export function OrdersTable({
  items,
  bulkFields,
}: {
  items: OrdersRowData[];
  /** Поля «Групової обробки» (масова зміна прапорців) — лише admin/owner. */
  bulkFields?: SerializedBulkField[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { requestMark, dialog: deleteDialog } = useDocMarkDeletion();
  const bulkEnabled = (bulkFields?.length ?? 0) > 0;
  const bulk = useBulkSelection();
  const [bulkOpen, setBulkOpen] = useState(false);
  const pageIds = items.map((o) => o.id);

  function setSort(key: string, dir: "asc" | "desc") {
    const p = new URLSearchParams(searchParams);
    p.set("sort", key);
    p.set("dir", dir);
    p.delete("page");
    router.push(`${pathname}?${p.toString()}`);
  }

  const buildItems = (
    ctx: MenuContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _close: () => void,
  ): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    items.push({
      type: "action",
      label: "Відкрити",
      onSelect: () => router.push(ctx.href),
    });
    const meta = ctx.col ? COLS[ctx.col] : undefined;
    if (meta?.filterParam && ctx.value) {
      items.push({
        type: "action",
        label: `Відбір за значенням: «${ctx.value}»`,
        onSelect: () => {
          const p = new URLSearchParams(searchParams);
          p.set(meta.filterParam as string, ctx.value as string);
          p.delete("page");
          router.push(`${pathname}?${p.toString()}`);
        },
      });
    }
    if (meta?.sortKey) {
      items.push({
        type: "action",
        label: "Сортувати за зростанням",
        onSelect: () => setSort(meta.sortKey as string, "asc"),
      });
      items.push({
        type: "action",
        label: "Сортувати за спаданням",
        onSelect: () => setSort(meta.sortKey as string, "desc"),
      });
    }
    items.push({ type: "separator" });
    if (ctx.value) {
      items.push({
        type: "action",
        label: "Скопіювати значення",
        onSelect: () => navigator.clipboard?.writeText(ctx.value as string),
      });
    }
    items.push({
      type: "action",
      label: "Скинути фільтри",
      onSelect: () => router.push(pathname),
    });
    items.push({
      type: "action",
      label: "Оновити",
      onSelect: () => router.refresh(),
    });
    // Позначення замовлення на вилучення (ownership/права перевіряє сервер).
    const orderId = ctx.href.split("/").pop();
    if (orderId) {
      items.push({ type: "separator" });
      items.push({
        type: "action",
        danger: true,
        label: "Позначити на вилучення",
        onSelect: () =>
          requestMark({
            entityType: "order",
            entityId: orderId,
            message:
              "Позначити це замовлення на вилучення? Остаточне рішення прийме адміністратор.",
          }),
      });
    }
    return items;
  };

  const { rowHandlers, menu } = useListContextMenu(buildItems);

  if (items.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs tracking-wide text-gray-500 uppercase">
            {bulkEnabled && (
              <th className="w-8 px-2.5 py-1.5">
                <input
                  type="checkbox"
                  checked={bulk.allOnPageSelected(pageIds)}
                  onChange={() => bulk.toggleAllOnPage(pageIds)}
                  aria-label="Вибрати всі на сторінці"
                />
              </th>
            )}
            <th className="px-2.5 py-1.5 font-medium">
              <SortableHeader sortKey="code" label="№" />
            </th>
            <th className="px-2.5 py-1.5 font-medium">
              <SortableHeader sortKey="client" label="Клієнт" />
            </th>
            <th className="px-2.5 py-1.5 font-medium">
              <SortableHeader sortKey="city" label="Місто" />
            </th>
            <th className="px-2.5 py-1.5 font-medium">Область</th>
            <th className="px-2.5 py-1.5 font-medium">
              <SortableHeader sortKey="date" label="Дата" />
            </th>
            <th className="px-2.5 py-1.5 font-medium">
              <SortableHeader sortKey="status" label="Статус" />
            </th>
            <th className="px-2.5 py-1.5 text-center font-medium">
              <SortableHeader
                sortKey="actual"
                label="Актуальний"
                align="center"
              />
            </th>
            <th className="px-2.5 py-1.5 font-medium">
              <SortableHeader sortKey="agent" label="Агент" />
            </th>
            <th className="px-2.5 py-1.5 text-center font-medium">
              <SortableHeader
                sortKey="positions"
                label="Позицій"
                align="center"
              />
            </th>
            <th className="px-2.5 py-1.5 text-right font-medium">
              <SortableHeader sortKey="sum" label="Сума" align="right" />
            </th>
            <th className="w-12 px-2.5 py-1.5 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <OrdersRow
              key={o.id}
              order={o}
              rowHandlers={rowHandlers(`/manager/orders/${o.id}`)}
              selectable={bulkEnabled}
              selected={bulk.isSelected(o.id)}
              onToggle={() => bulk.toggle(o.id)}
            />
          ))}
        </tbody>
      </table>
      {menu}
      {deleteDialog}
      {bulkEnabled && (
        <>
          <BulkProcessingBar
            count={bulk.count}
            onOpen={() => setBulkOpen(true)}
            onClear={bulk.clear}
          />
          <BulkFieldDialog
            entity="order"
            fields={bulkFields ?? []}
            ids={Array.from(bulk.selected)}
            open={bulkOpen}
            onClose={() => setBulkOpen(false)}
            onDone={() => {
              setBulkOpen(false);
              bulk.clear();
            }}
          />
        </>
      )}
    </div>
  );
}
