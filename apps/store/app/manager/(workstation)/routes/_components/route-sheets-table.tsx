"use client";

import { useRouter } from "next/navigation";
import { RouteSheetsRow, type RouteSheetsRowData } from "./route-sheets-row";
import { useListContextMenu } from "../../_components/use-list-context-menu";
import type { ContextMenuItem } from "../../_components/list-context-menu";
import type { MenuContext } from "../../_components/use-list-context-menu";

export function RouteSheetsTable({ items }: { items: RouteSheetsRowData[] }) {
  const router = useRouter();

  const buildItems = (
    ctx: MenuContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _close: () => void,
  ): ContextMenuItem[] => {
    const menuItems: ContextMenuItem[] = [];
    menuItems.push({
      type: "action",
      label: "Відкрити",
      onSelect: () => router.push(ctx.href),
    });
    if (ctx.value) {
      menuItems.push({
        type: "action",
        label: "Скопіювати значення",
        onSelect: () => navigator.clipboard?.writeText(ctx.value as string),
      });
    }
    menuItems.push({
      type: "action",
      label: "Оновити",
      onSelect: () => router.refresh(),
    });
    // Видалення маршрутного листа (права перевіряє сервер). `ctx.href`
    // = /manager/routes/<id>, де <id> = id маршрутного листа.
    const sheetId = ctx.href.split("/").pop();
    if (sheetId) {
      menuItems.push({ type: "separator" });
      menuItems.push({
        type: "action",
        danger: true,
        label: "Видалити",
        onSelect: () => {
          void deleteRouteSheet(sheetId);
        },
      });
    }
    return menuItems;
  };

  async function deleteRouteSheet(sheetId: string) {
    if (
      !window.confirm(
        "Видалити цей маршрутний лист? Дію не можна скасувати. Реалізації та оплати маршруту буде відв'язано (не видалено).",
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/manager/route-sheets/${sheetId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        window.alert(data?.error ?? "Не вдалося видалити маршрутний лист");
      }
    } catch {
      window.alert("Помилка мережі під час видалення");
    }
  }

  const { rowHandlers, menu } = useListContextMenu(buildItems);

  if (items.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs tracking-wide text-gray-500 uppercase">
            <th className="px-2.5 py-1.5 font-medium">Дата</th>
            <th className="px-2.5 py-1.5 font-medium">Номер</th>
            <th className="px-2.5 py-1.5 font-medium">Маршрут</th>
            <th className="px-2.5 py-1.5 font-medium">Експедитор</th>
            <th className="px-2.5 py-1.5 font-medium">Статус</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Сума</th>
            <th className="w-12 px-2.5 py-1.5 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <RouteSheetsRow
              key={s.id}
              sheet={s}
              rowHandlers={rowHandlers(`/manager/routes/${s.id}`)}
            />
          ))}
        </tbody>
      </table>
      {menu}
    </div>
  );
}
