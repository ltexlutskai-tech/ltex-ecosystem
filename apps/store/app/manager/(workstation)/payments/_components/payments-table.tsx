"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PaymentsRow, type PaymentsRowData } from "./payments-row";
import { SortableHeader } from "../../_components/sortable-header";
import { useListContextMenu } from "../../_components/use-list-context-menu";
import type { ContextMenuItem } from "../../_components/list-context-menu";
import type { MenuContext } from "../../_components/use-list-context-menu";

/**
 * Мапа `data-col` → ключ сортування / URL-параметр фільтра «відбору».
 * Нові колонки додаються тут.
 */
const COLS: Record<string, { sortKey?: string; filterParam?: string }> = {
  date: { sortKey: "date" },
  code: { sortKey: "code" },
  type: { sortKey: "type" },
  client: { sortKey: "client", filterParam: "client" },
  article: { sortKey: "article", filterParam: "article" },
  sum: { sortKey: "sum" },
  account: { sortKey: "account", filterParam: "account" },
};

export function PaymentsTable({ items }: { items: PaymentsRowData[] }) {
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
    // Видалення касового ордера (ownership/права перевіряє сервер). `ctx.href`
    // = /manager/payments/<id>, де <id> = id касового ордера.
    const cashOrderId = ctx.href.split("/").pop();
    if (cashOrderId) {
      items.push({ type: "separator" });
      items.push({
        type: "action",
        danger: true,
        label: "Видалити",
        onSelect: () => {
          void deleteCashOrder(cashOrderId);
        },
      });
    }
    return items;
  };

  async function deleteCashOrder(cashOrderId: string) {
    if (
      !window.confirm(
        "Видалити цей касовий ордер? Дію не можна скасувати. Борг клієнта буде перераховано, парний ордер-здача видалено.",
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/manager/cash-orders/${cashOrderId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        window.alert(data?.error ?? "Не вдалося видалити оплату");
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
            <th className="px-2.5 py-1.5 font-medium">
              <SortableHeader sortKey="date" label="Дата" />
            </th>
            <th className="px-2.5 py-1.5 font-medium">
              <SortableHeader sortKey="code" label="Номер" />
            </th>
            <th className="px-2.5 py-1.5 font-medium">
              <SortableHeader sortKey="type" label="Вид" />
            </th>
            <th className="px-2.5 py-1.5 font-medium">
              <SortableHeader sortKey="client" label="Клієнт" />
            </th>
            <th className="px-2.5 py-1.5 font-medium">
              <SortableHeader sortKey="article" label="Стаття" />
            </th>
            <th className="px-2.5 py-1.5 text-right font-medium">
              <SortableHeader sortKey="sum" label="Сума" align="right" />
            </th>
            <th className="px-2.5 py-1.5 font-medium">
              <SortableHeader sortKey="account" label="Рахунок" />
            </th>
            <th className="px-2.5 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <PaymentsRow
              key={o.id}
              order={o}
              rowHandlers={rowHandlers(`/manager/payments/${o.id}`)}
            />
          ))}
        </tbody>
      </table>
      {menu}
    </div>
  );
}
