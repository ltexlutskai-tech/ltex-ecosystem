"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { OrdersRow, type OrdersRowData } from "./orders-row";
import { SortableHeader } from "../../_components/sortable-header";
import { useListContextMenu } from "../../_components/use-list-context-menu";
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
  delivery: { sortKey: "delivery" },
  positions: { sortKey: "positions" },
  sum: { sortKey: "sum" },
};

export function OrdersTable({ items }: { items: OrdersRowData[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
    // нові пункти додаються тут (Провести / Видалити тощо)
    return items;
  };

  const { rowHandlers, menu } = useListContextMenu(buildItems);

  if (items.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs tracking-wide text-gray-500 uppercase">
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
            <th className="px-2.5 py-1.5 font-medium">
              <SortableHeader sortKey="delivery" label="Спосіб доставки" />
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
            />
          ))}
        </tbody>
      </table>
      {menu}
    </div>
  );
}
